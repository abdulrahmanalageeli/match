import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import toast, { Toaster } from "react-hot-toast"
import { useVisibilityPoll } from "~/hooks/useVisibilityPoll"
import {
  Users, Play, Square, ChevronRight, RotateCcw, CheckCircle,
  Circle, RefreshCw, Table2, Trophy, Clock, BarChart3, Shuffle,
  Eye, EyeOff, ArrowRight, Sparkles, Brain, Shield, LogOut,
  Grid3x3, Star, Check, AlertCircle, AlertTriangle, Loader2, Copy, Heart, Layers, ChevronDown, X, XCircle, MessageSquare, Send, Home, Trash2, GripVertical, Search, Crown, Medal, Coffee, Ban, ArrowLeft, Bell, Calendar, Download, FlaskConical, Phone, Pencil, Save,
} from "lucide-react"

let _adminPassword = ""
function setAdminPassword(p: string) { _adminPassword = p }
const API = "/api/admin"

const PHASES = [
  { id: "setup",          label: "إعداد الفعالية",       icon: "⚙️", color: "gray" },
  { id: "round1",         label: "الجولة الأولى",        icon: "1️⃣", color: "blue" },
  { id: "ranking1",       label: "التصنيف — جولة 1",    icon: "🏆", color: "yellow" },
  { id: "round2",         label: "الجولة الثانية",       icon: "2️⃣", color: "indigo" },
  { id: "ranking2",       label: "التصنيف النهائي",      icon: "🏆", color: "yellow" },
  { id: "break",          label: "استراحة",              icon: "☕", color: "orange" },
  { id: "phase2_reveal",  label: "الكشف الأول",          icon: "💘", color: "pink" },
  { id: "phase3_reveal",  label: "الكشف الثاني",         icon: "🧠", color: "purple" },
  { id: "final_reveal",   label: "الكشف النهائي",        icon: "✨", color: "amber" },
]

function api(action: string, extra: Record<string, any> = {}) {
  const body: Record<string, any> = { action, password: _adminPassword, ...extra }
  if (_previewEventId != null && !('preview_event_id' in body) && action.startsWith('e3-') && action !== 'e3-set-current-event' && action !== 'e3-get-current-event' && action !== 'e3-get-event-list') {
    body.preview_event_id = _previewEventId
  }
  return fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(r => r.json())
}

let _previewEventId: number | null = null
function setPreviewEventId(id: number | null) { _previewEventId = id }
function getPreviewEventId() { return _previewEventId }

// These are the ONLY fields participants actually fill out in FeedbackFlow (event3.tsx).
// The edit modal must mirror this exactly — no invented fields.
function FeedbackEditModal({ entry, phase, onClose, onSave }: {
  entry: any; phase: string; onClose: () => void; onSave: (fb: any) => Promise<void>
}) {
  // Same default shape as FeedbackFlow's initial state in event3.tsx, so admin edits
  // produce an object identical in structure to what participants actually submit.
  const defaultFb = {
    conversationQuality: 0, personalConnection: 0,
    wantConnect: null as boolean | null, organizerImpression: "",
    compatibilityRate: 50, sliderMoved: false, sharedInterests: 3, comfortLevel: 3,
    communicationStyle: 3, wouldMeetAgain: 3, overallExperience: 3, recommendations: "", participantMessage: "",
  }
  const existing = { ...defaultFb, ...(entry.feedback || {}) }
  const [conversationQuality, setConversationQuality] = useState<number>(existing.conversationQuality || 0)
  const [personalConnection, setPersonalConnection] = useState<number>(existing.personalConnection || 0)
  const [wantConnect, setWantConnect] = useState<boolean | null>(existing.wantConnect ?? null)
  const [organizerImpression, setOrganizerImpression] = useState<string>(existing.organizerImpression || "")
  const [compatibilityRate, setCompatibilityRate] = useState<number>(existing.compatibilityRate ?? 50)
  const [saving, setSaving] = useState(false)

  const convoLabels = ["سيئة", "ضعيفة", "مقبولة", "جيدة", "ممتازة"]
  const connectionLabels = ["لا شيء", "ضعيف", "مقبول", "جيد", "رائع"]

  const RatingSelector = ({ value, onChange, labels }: { value: number; onChange: (n: number) => void; labels: string[] }) => (
    <div className="flex gap-1.5">
      {labels.map((label, i) => (
        <button key={i} type="button"
          onClick={() => onChange(i + 1)}
          className={`flex-1 py-2 rounded-lg text-[10px] font-medium transition-all ${
            value === i + 1
              ? "bg-purple-600 text-white shadow-lg shadow-purple-900/40"
              : "bg-gray-800 text-gray-500 hover:bg-gray-700"
          }`}>{label}</button>
      ))}
    </div>
  )

  const handleSubmit = async () => {
    setSaving(true)
    // Preserve all other stored keys (word, defaults, etc.) — only override the real fields.
    await onSave({ ...existing, conversationQuality, personalConnection, wantConnect, organizerImpression, compatibilityRate, sliderMoved: true })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Pencil size={14} className="text-purple-400" /> تعديل التقييم
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {entry.participant_name} #{entry.participant_number}
              <span className="text-gray-600"> عن </span>
              {entry.partner_name} #{entry.partner_number}
              <span className="text-gray-600"> · {phase === "phase2" ? "اختيارك" : "الخوارزمية"}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">كيف كانت المحادثة؟</label>
            <RatingSelector value={conversationQuality} onChange={setConversationQuality} labels={convoLabels} />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">التواصل الشخصي</label>
            <RatingSelector value={personalConnection} onChange={setPersonalConnection} labels={connectionLabels} />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">هل يريد التواصل لاحقاً؟</label>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => setWantConnect(true)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  wantConnect === true ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                }`}>نعم</button>
              <button type="button"
                onClick={() => setWantConnect(false)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  wantConnect === false ? "bg-red-600 text-white" : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                }`}>لا</button>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">تخمين درجة التوافق: <span className={`font-bold ${
              compatibilityRate >= 80 ? 'text-emerald-400' :
              compatibilityRate >= 60 ? 'text-amber-400' :
              compatibilityRate >= 40 ? 'text-orange-400' : 'text-red-400'
            }`}>{compatibilityRate}%</span></label>
            <input type="range" min="0" max="100" step="5" value={compatibilityRate}
              onChange={e => setCompatibilityRate(parseInt(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-700 focus:outline-none"
              style={{ direction: 'ltr' }} />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">ملاحظة للمنظم (سرّية)</label>
            <textarea value={organizerImpression}
              onChange={e => e.target.value.length <= 300 && setOrganizerImpression(e.target.value)}
              rows={3} placeholder="شعرت بالراحة... / الوقت كان قصيراً..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-xs text-white placeholder:text-gray-600 focus:border-purple-500 focus:outline-none resize-none" />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-xs font-medium bg-gray-800 border border-gray-700 text-gray-400 hover:text-white transition-colors">
            إلغاء
          </button>
          <button onClick={handleSubmit} disabled={saving || wantConnect === null}
            className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 flex items-center justify-center gap-1.5">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            حفظ التغييرات
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Admin3Page() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState("")

  const [state, setState] = useState<any>(null)
  const [previewEventId, setPreviewEventIdState] = useState<number | null>(null)
  const [eventList, setEventList] = useState<number[]>([])
  const [realCurrentEventId, setRealCurrentEventId] = useState<number>(20)
  const [migrationErrors, setMigrationErrors] = useState<string[] | null>(null)
  const [diagnostics, setDiagnostics] = useState<{ healthy: boolean; checks: any[] } | null>(null)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const [report, setReport] = useState<any | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [exclusions, setExclusions] = useState<any[]>([])
  const [exclusionA, setExclusionA] = useState<number | "">("")
  const [exclusionB, setExclusionB] = useState<number | "">("")
  const [exclusionReason, setExclusionReason] = useState("")
  const [participants, setParticipants] = useState<any[]>([])
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(new Set())
  const [seating, setSeating] = useState<any>(null)
  const [rankStatus, setRankStatus] = useState<any>(null)
  const [allRankings, setAllRankings] = useState<any[]>([])
  const [expandedRanker, setExpandedRanker] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [matchPairs, setMatchPairs] = useState<any[]>([])
  const [phase3Pairs, setPhase3Pairs] = useState<any[]>([])
  const [expandedPair, setExpandedPair] = useState<number | null>(null)
  const [expandedPhase3Pair, setExpandedPhase3Pair] = useState<number | null>(null)
  const [swapMatch, setSwapMatch] = useState<{ phase: "phase2" | "phase3"; missingNum: number; missingName: string } | null>(null)
  const [swapReplacement, setSwapReplacement] = useState<number | null>(null)
  const [replaceParticipant, setReplaceParticipant] = useState<{ oldNum: number; oldName: string } | null>(null)
  const [replaceWith, setReplaceWith] = useState<number | null>(null)

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
  const [paidFilter, setPaidFilter] = useState("all")
  const [activeTab, setActiveTab] = useState<"control" | "seating" | "ranking" | "participants" | "overview" | "feedback" | "attendance" | "aiwelcome">("control")
  const [overviewData, setOverviewData] = useState<any>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [timerRemaining, setTimerRemaining] = useState(0)

  const phase3MissingCount = useMemo(() => {
    if (!state?.phase3_matches_done || !seating || !participants.length) return 0
    const assignedIds = new Set<number>()
    for (const members of Object.values(seating[30] || {})) {
      for (const m of (members as any[])) if (m?.number) assignedIds.add(m.number)
    }
    return participants.filter(p => p.selected && !assignedIds.has(p.number)).length
  }, [state?.phase3_matches_done, seating, participants])

  const [editingRanker, setEditingRanker] = useState<number | null>(null)
  const [editedOrder, setEditedOrder] = useState<any[]>([])
  const [simulatingRanker, setSimulatingRanker] = useState<number | null>(null)
  const [simOrder, setSimOrder] = useState<any[]>([])
  const [simLoading, setSimLoading] = useState(false)
  const [swapA, setSwapA] = useState<number | null>(null)
  const [moveA, setMoveA] = useState<number | null>(null)
  const [mapRound, setMapRound] = useState<1 | 2 | 20 | 30>(1)
  const [editingTable, setEditingTable] = useState<{ num: number; round: number; value: string } | null>(null)
  const [editingTableCard, setEditingTableCard] = useState<{ round: number; table: number; value: string } | null>(null)
  const [selectedParticipantNum, setSelectedParticipantNum] = useState<number | null>(null)
  const [participantPanelOpen, setParticipantPanelOpen] = useState(false)
  const [pairDetail, setPairDetail] = useState<any | null>(null)
  const [surveyModal, setSurveyModal] = useState<any | null>(null)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['personality', 'comm', 'energy', 'humor', 'values', 'intent']))
  const [overviewSearch, setOverviewSearch] = useState("")
  const [overviewFilter, setOverviewFilter] = useState("all")
  const [participantSort, setParticipantSort] = useState<"number" | "name" | "voted">("number")
  const [feedbackData, setFeedbackData] = useState<any>(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackPolling, setFeedbackPolling] = useState(false)
  const [feedbackPhase, setFeedbackPhase] = useState<"phase2" | "phase3">("phase2")
  const [editingFeedback, setEditingFeedback] = useState<any>(null)
  const [analyzingPair, setAnalyzingPair] = useState<{ entry: any; phase: string } | null>(null)
  const [pairAnalysisResult, setPairAnalysisResult] = useState<{
    analysis: string
    event_id?: number
    subject?: { number: number; name: string }
    partner?: { number: number; name: string }
    alternative?: { number: number; name: string; breakdown: any; phase?: string } | null
    actualBreakdown?: any
    alternativeBreakdown?: any
    diff?: Record<string, number>
    largestGapKey?: string | null
    feedback?: any
    feedbackSignal?: any
  } | null>(null)
  const [pairAnalysisLoading, setPairAnalysisLoading] = useState(false)
  const [feedbackSearch, setFeedbackSearch] = useState("")
  const [feedbackFilter, setFeedbackFilter] = useState<"all" | "submitted" | "missing" | "mutual">("all")
  const [moodData, setMoodData] = useState<any>(null)
  const [moodLoading, setMoodLoading] = useState(false)
  const [moodTarget, setMoodTarget] = useState<string>("") // participant number or empty for all
  const [moodSending, setMoodSending] = useState(false)
  const [notifData, setNotifData] = useState<any>(null)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifTarget, setNotifTarget] = useState<string>("")
  const [notifSending, setNotifSending] = useState(false)
  const [notifTitle, setNotifTitle] = useState<string>("")
  const [notifBody, setNotifBody] = useState<string>("")
  const [notifIcon, setNotifIcon] = useState<string>("info")
  const [rankSearch, setRankSearch] = useState("")
  const [rankFilter, setRankFilter] = useState<"all" | "submitted" | "pending">("all")
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const [sosRequests, setSosRequests] = useState<any[]>([])
  const [sosModalOpen, setSosModalOpen] = useState(false)
  const [attendanceData, setAttendanceData] = useState<any[]>([])
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [attendanceToggling, setAttendanceToggling] = useState<Record<number, boolean>>({})
  const [attendanceSearch, setAttendanceSearch] = useState("")
  const [testMode, setTestMode] = useState(false)
  const [testModeLoading, setTestModeLoading] = useState(false)
  const [testModeData, setTestModeData] = useState<any>(null)
  const [testUsersFilter, setTestUsersFilter] = useState("")
  const [confirmModal, setConfirmModal] = useState<{ type: "mood" | "notif"; target: string; onConfirm: () => void } | null>(null)
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [sosFilter, setSosFilter] = useState<'all' | 'active' | 'resolved'>('all')
  const knownSosIds = useRef<Set<string>>(new Set())
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  const [selectedSosId, setSelectedSosId] = useState<string | null>(null)
  const [initiateChatOpen, setInitiateChatOpen] = useState(false)
  const [initiateChatTarget, setInitiateChatTarget] = useState<any>(null)
  const [initiateChatText, setInitiateChatText] = useState("")
  const [initiateSending, setInitiateSending] = useState(false)

  // AI Welcome tab state
  const [aiWelcomeData, setAiWelcomeData] = useState<any[]>([])
  const [aiWelcomeLoading, setAiWelcomeLoading] = useState(false)
  const [aiWelcomeSearch, setAiWelcomeSearch] = useState("")
  const [aiWelcomeFilter, setAiWelcomeFilter] = useState<"all" | "generated" | "missing">("all")
  const [aiWelcomeSelected, setAiWelcomeSelected] = useState<Set<number>>(new Set())
  const [aiWelcomeGenerating, setAiWelcomeGenerating] = useState(false)
  const [aiWelcomeProgress, setAiWelcomeProgress] = useState<{ done: number; total: number } | null>(null)
  const [aiWelcomePreview, setAiWelcomePreview] = useState<any | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem("admin3_pw")
    if (stored) {
      setAdminPassword(stored)
      if (localStorage.getItem("admin3") === "authenticated") {
        setAuthenticated(true)
      }
    }
  }, [])

  const login = async () => {
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "e3-get-current-event", password }),
      }).then(r => r.json())
      if (r.error) {
        toast.error("كلمة المرور غير صحيحة")
      } else {
        setAdminPassword(password)
        sessionStorage.setItem("admin3_pw", password)
        localStorage.setItem("admin3", "authenticated")
        setAuthenticated(true)
      }
    } catch {
      toast.error("تعذر الاتصال بالخادم")
    }
  }

  const logout = () => {
    setAdminPassword("")
    sessionStorage.removeItem("admin3_pw")
    localStorage.removeItem("admin3")
    setAuthenticated(false)
    setPassword("")
  }

  const runDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true)
    const data = await api("e3-run-diagnostics")
    setDiagnostics(data)
    setDiagnosticsLoading(false)
  }, [])

  const generateReport = useCallback(async () => {
    setReportLoading(true)
    const data = await api("e3-generate-report")
    setReport(data)
    setReportLoading(false)
  }, [])

  const fetchExclusions = useCallback(async () => {
    const data = await api("e3-get-exclusions")
    setExclusions(data.exclusions || [])
  }, [])

  const addExclusion = useCallback(async () => {
    if (!exclusionA || !exclusionB || exclusionA === exclusionB) return
    await run("add-exclusion", () => api("e3-add-exclusion", { participant_a_number: exclusionA, participant_b_number: exclusionB, reason: exclusionReason }))
    setExclusionA("")
    setExclusionB("")
    setExclusionReason("")
    fetchExclusions()
  }, [exclusionA, exclusionB, exclusionReason, fetchExclusions])

  const removeExclusion = useCallback(async (id: number) => {
    await run("remove-exclusion", () => api("e3-remove-exclusion", { id }))
    fetchExclusions()
  }, [fetchExclusions])

  const fetchState = useCallback(async () => {
    const data = await api("e3-get-state")
    if (data._debug) {
      console.log("[admin3] e3-get-state debug:", data._debug)
      const errs = Object.values(data._debug.errors || {}).filter(Boolean) as string[]
      if (errs.length > 0) setMigrationErrors(prev => prev ?? errs)
    }
    setState(data)
  }, [])

  const fetchParticipants = useCallback(async (opts?: { preserveSelection?: boolean }) => {
    const data = await api("e3-get-participants")
    if (data.participants) {
      setParticipants(data.participants)
      if (!opts?.preserveSelection) {
        const sel = new Set<number>(data.participants.filter((p: any) => p.selected).map((p: any) => p.number))
        setSelectedNumbers(sel)
      }
    }
  }, [])

  const fetchSeating = useCallback(async () => {
    const data = await api("e3-get-seating")
    setSeating(data.seating)
  }, [])

  const fetchMatches = useCallback(async () => {
    const data = await api("e3-get-matches")
    setMatchPairs(data.pairs || [])
    setPhase3Pairs(data.phase3Pairs || [])
  }, [])

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true)
    const data = await api("e3-get-overview")
    setOverviewData(data)
    setOverviewLoading(false)
  }, [])

  const fetchFeedback = useCallback(async () => {
    setFeedbackLoading(true)
    const data = await api("e3-get-feedback")
    setFeedbackData(data)
    setFeedbackLoading(false)
  }, [])

  const handleEditFeedback = useCallback(async (participantNumber: number, phase: string, newFb: any) => {
    const d = await api("e3-edit-feedback", { participant_number: participantNumber, phase, feedback: newFb })
    if (d.error) { toast.error(d.error); return false }
    toast.success("تم تعديل التقييم")
    fetchFeedback()
    return true
  }, [fetchFeedback])

  const handleEditFeedbackRef = useRef(handleEditFeedback)
  handleEditFeedbackRef.current = handleEditFeedback

  const openPairAnalysis = useCallback(async (entry: any, phase: string) => {
    setAnalyzingPair({ entry, phase })
    setPairAnalysisResult(null)
    setPairAnalysisLoading(true)
    const d = await api("e3-analyze-pair", { participant_number: entry.participant_number, partner_number: entry.partner_number, phase })
    setPairAnalysisLoading(false)
    if (d.error) { toast.error(d.error); setAnalyzingPair(null); return }
    setPairAnalysisResult({
      analysis: d.analysis,
      event_id: d.event_id,
      subject: d.subject,
      partner: d.partner,
      alternative: d.alternative,
      actualBreakdown: d.actualBreakdown,
      alternativeBreakdown: d.alternativeBreakdown,
      diff: d.diff,
      largestGapKey: d.largestGapKey,
      feedback: d.feedback,
      feedbackSignal: d.feedbackSignal,
    })
  }, [])

  const fetchMoodChecks = useCallback(async () => {
    setMoodLoading(true)
    const data = await api("e3-get-mood-checks")
    setMoodData(data)
    setMoodLoading(false)
  }, [])

  const sendMoodCheck = useCallback(async () => {
    if (previewEventId != null) { toast.error("لا يمكن إرسال فحص المزاج في وضع المعاينة"); return }
    const targetLabel = moodTarget ? `المشارك #${moodTarget}` : "جميع المشاركين"
    setConfirmModal({ type: "mood", target: targetLabel, onConfirm: async () => {
      setMoodSending(true)
      const data = await api("e3-trigger-mood-check", moodTarget ? { target_number: moodTarget } : {})
      setMoodSending(false)
      if (data.error) { toast.error(data.error); return }
      toast.success(`تم إرسال فحص المزاج إلى ${data.sent_to} شخص`)
      setMoodTarget("")
      setTimeout(() => fetchMoodChecks(), 1000)
    }})
  }, [moodTarget, fetchMoodChecks])

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true)
    const data = await api("e3-get-notifications")
    setNotifData(data)
    setNotifLoading(false)
  }, [])

  const fetchAttendance = useCallback(async () => {
    setAttendanceLoading(true)
    const data = await api("e3-get-attendance")
    if (data.participants) setAttendanceData(data.participants)
    setAttendanceLoading(false)
  }, [])

  const fetchAiWelcome = useCallback(async () => {
    setAiWelcomeLoading(true)
    const data = await api("e3-ai-welcome-list")
    if (data.participants) setAiWelcomeData(data.participants)
    setAiWelcomeLoading(false)
  }, [])

  const toggleAttendance = useCallback(async (p: any) => {
    if (previewEventId != null) { toast.error("لا يمكن تعديل الحضور في وضع المعاينة"); return }
    setAttendanceToggling(prev => ({ ...prev, [p.number]: true }))
    const data = await api("e3-set-attendance", { participant_number: p.number, attended: !p.attended })
    if (data.success) {
      setAttendanceData(prev => prev.map((x: any) => x.number === p.number ? { ...x, attended: data.attended } : x))
    }
    setAttendanceToggling(prev => { const c = { ...prev }; delete c[p.number]; return c })
  }, [])

  const sendNotification = useCallback(async () => {
    if (previewEventId != null) { toast.error("لا يمكن إرسال الإشعارات في وضع المعاينة"); return }
    if (!notifTitle.trim()) { toast.error("اكتب عنوان الإشعار"); return }
    const targetLabel = notifTarget ? `المشارك #${notifTarget}` : "جميع المشاركين"
    setConfirmModal({ type: "notif", target: targetLabel, onConfirm: async () => {
      setNotifSending(true)
      const data = await api("e3-send-notification", {
        title: notifTitle.trim(),
        body: notifBody.trim() || undefined,
        icon: notifIcon,
        ...(notifTarget ? { target_number: notifTarget } : {})
      })
      setNotifSending(false)
      if (data.error) { toast.error(data.error); return }
      toast.success(`تم إرسال الإشعار إلى ${data.sent_to} شخص`)
      setNotifTitle(""); setNotifBody(""); setNotifTarget("")
      setTimeout(() => fetchNotifications(), 1000)
    }})
  }, [notifTitle, notifBody, notifIcon, notifTarget, fetchNotifications])

  const mbtiGroupFn = (m: string) => {
    if (!m) return null
    const t = m.toUpperCase()
    if (['INFJ','INFP','ENFJ','ENFP'].includes(t)) return { label: m, cls: 'bg-violet-900/60 text-violet-300 border-violet-700/50' }
    if (['INTJ','INTP','ENTJ','ENTP'].includes(t)) return { label: m, cls: 'bg-blue-900/60 text-blue-300 border-blue-700/50' }
    if (['ISFJ','ISFP','ESFJ','ESFP'].includes(t)) return { label: m, cls: 'bg-pink-900/50 text-pink-300 border-pink-700/50' }
    return { label: m, cls: 'bg-teal-900/50 text-teal-300 border-teal-700/50' }
  }

  const getRankerFn = (num: number) => allRankings.find((r: any) => r.number === num)
  const isMutualTop3Fn = (a: number, b: number) => {
    const ra = getRankerFn(a), rb = getRankerFn(b)
    if (!ra?.ranked_list || !rb?.ranked_list) return false
    const aRankedB = ra.ranked_list.find((item: any) => item.number === b)
    const bRankedA = rb.ranked_list.find((item: any) => item.number === a)
    return !!(aRankedB?.rank <= 3 && bRankedA?.rank <= 3)
  }

  const fetchSOS = useCallback(async () => {
    const data = await api("e3-get-sos")
    if (!data.requests) return
    const newRequests: any[] = data.requests
    const newPending = newRequests.filter(r => r.status === 'pending' && !knownSosIds.current.has(r.id))
    const freshIds = new Set<string>()
    newRequests.forEach(r => {
      if (!knownSosIds.current.has(r.id)) {
        freshIds.add(r.id)
      }
      knownSosIds.current.add(r.id)
    })
    if (freshIds.size > 0) {
      setFlashIds(freshIds)
      setTimeout(() => setFlashIds(new Set()), 3000)
    }
    if (newPending.length > 0) {
      const msg = newPending.length === 1
        ? `🆘 ${newPending[0].participant_name} (#${newPending[0].participant_number}) يطلب المنظم!`
        : `🆘 ${newPending.length} طلبات جديدة!`
      toast(msg, { duration: 8000, style: { background: '#1f0505', color: '#fca5a5', border: '1px solid #7f1d1d', borderRadius: '12px' } })
      setSosModalOpen(true)
    }
    setSosRequests(newRequests)
  }, [])

  const handleSOSAction = async (id: string, reply: string | null, newStatus: string) => {
    await api("e3-sos-reply", { id, reply, status: newStatus })
    if (newStatus === 'resolved') {
      knownSosIds.current.delete(id)
      setSosRequests(prev => prev.filter(r => r.id !== id))
      setSelectedSosId(null)
    } else {
      setReplyText("")
      fetchSOS()
    }
  }

  const initiateChat = async () => {
    if (!initiateChatText.trim() || !initiateChatTarget) return
    setInitiateSending(true)
    const d = await api("e3-sos-initiate", {
      participant_number: initiateChatTarget.number,
      participant_name: initiateChatTarget.name,
      message: initiateChatText.trim()
    })
    setInitiateSending(false)
    if (d.error) { toast.error(d.error); return }
    toast.success("تم إرسال الرسالة ✅")
    setInitiateChatOpen(false)
    setInitiateChatText("")
    setInitiateChatTarget(null)
    fetchSOS()
    setSosModalOpen(true)
  }

  const fetchRankStatus = useCallback(async () => {
    const data = await api("e3-get-rankings-status")
    setRankStatus(data)
    const allData = await api("e3-get-all-rankings")
    setAllRankings(allData.rankings || [])
    await fetchMatches()
  }, [fetchMatches])

  const fetchEventList = useCallback(async () => {
    const data = await api("e3-get-event-list")
    console.log("[admin3] e3-get-event-list response:", data)
    if (data.errors) {
      const errs = Object.values(data.errors).filter(Boolean) as string[]
      if (errs.length > 0) {
        console.error("[admin3] event list errors:", data.errors)
        setMigrationErrors(errs)
      }
    }
    if (data.events) setEventList(data.events)
    if (data.current_event_id) setRealCurrentEventId(data.current_event_id)
  }, [])

  const checkTestMode = useCallback(async () => {
    const data = await api("e3-get-test-mode")
    if (data.test_mode) {
      setTestMode(true)
      if (!testModeData) setTestModeData(data)
    } else {
      setTestMode(false)
    }
  }, [testModeData])

  // Initial load on auth
  useEffect(() => {
    if (!authenticated) return
    fetchState()
    fetchParticipants()
    fetchSeating()
    fetchSOS()
    fetchEventList()
    checkTestMode()
  }, [authenticated, fetchState, fetchParticipants, fetchSeating, fetchSOS, fetchEventList, checkTestMode])

  // Visibility-aware polling for state (3s) and SOS (5s)
  useVisibilityPoll(fetchState, 3000, authenticated)
  useVisibilityPoll(fetchSOS, 5000, authenticated)

  useEffect(() => {
    if (authenticated && activeTab === "seating") { fetchSeating(); fetchRankStatus() }
    if (authenticated && activeTab === "ranking") fetchRankStatus()
    if (authenticated && activeTab === "participants") { fetchParticipants({ preserveSelection: true }); fetchSeating(); fetchRankStatus(); fetchMatches() }
    if (authenticated && activeTab === "overview") fetchOverview()
    if (authenticated && activeTab === "feedback") { fetchFeedback(); fetchMoodChecks(); fetchNotifications() }
    if (authenticated && activeTab === "attendance") fetchAttendance()
    if (authenticated && activeTab === "aiwelcome") fetchAiWelcome()
    if (authenticated && activeTab === "control") { fetchExclusions(); fetchSeating() }
  }, [activeTab, authenticated, fetchSeating, fetchRankStatus, fetchParticipants, fetchMatches, fetchOverview, fetchFeedback, fetchMoodChecks, fetchNotifications, fetchAttendance, fetchAiWelcome, fetchExclusions])

  // Feedback polling (visibility-aware)
  useVisibilityPoll(fetchFeedback, 5000, feedbackPolling && activeTab === "feedback")

  // Attendance polling (visibility-aware)
  useVisibilityPoll(fetchAttendance, 10000, activeTab === "attendance" && authenticated)

  // Timer countdown
  useEffect(() => {
    if (!state?.timer_active || !state?.timer_start) {
      setTimerRemaining(0)
      return
    }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(state.timer_start).getTime()) / 1000)
      setTimerRemaining(Math.max(0, (state.timer_duration || 1260) - elapsed))
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

  const setPhase = (phase: string) => { if (previewEventId != null) { toast.error("لا يمكن تغيير المرحلة في وضع المعاينة"); return } run(`phase-${phase}`, () => api("e3-set-phase", { phase })) }
  const setPhaseWithTimer = (phase: string, duration: number, round = 0) => {
    if (previewEventId != null) { toast.error("لا يمكن تغيير المرحلة في وضع المعاينة"); return }
    run(`phase-${phase}`, () => api("e3-set-phase", { phase, start_timer: true, timer_duration: duration, timer_round: round }))
  }
  const setPhaseStopTimer = (phase: string) => {
    if (previewEventId != null) { toast.error("لا يمكن تغيير المرحلة في وضع المعاينة"); return Promise.resolve() }
    return run(`phase-${phase}`, () => api("e3-set-phase", { phase, start_timer: false }))
  }
  const startTimer = (round: number, duration = 1260) => {
    if (previewEventId != null) { toast.error("لا يمكن تشغيل المؤقت في وضع المعاينة"); return }
    run("timer", () => api("e3-start-timer", { round, duration }))
  }
  const stopTimer = () => { if (previewEventId != null) { toast.error("لا يمكن إيقاف المؤقت في وضع المعاينة"); return } run("timer-stop", () => api("e3-stop-timer")) }
  const adjustTimer = (delta: number) => { if (previewEventId != null) { toast.error("لا يمكن تعديل المؤقت في وضع المعاينة"); return } run(`timer-${delta}`, () => api("e3-adjust-timer", { delta_seconds: delta }).then(d => { if (!d.error) fetchState(); return d })) }
  const saveRanking = (rankerNum: number) => {
    if (previewEventId != null) { toast.error("لا يمكن تعديل التصنيفات في وضع المعاينة"); return }
    run(`save-rank-${rankerNum}`, () => api("e3-set-ranking", { ranker_number: rankerNum, ranked_list: editedOrder.map(i => i.number) }).then(d => { if (!d.error) { setEditingRanker(null); fetchRankStatus() } return d }))
  }

  const startSimulate = async (rankerNum: number) => {
    setSimLoading(true)
    const data = await api("e3-get-met-for-admin", { participant_number: rankerNum })
    setSimLoading(false)
    if (data.error) { toast.error(data.error); return }
    if (!data.people || data.people.length === 0) { toast.error("لم يقابل أحداً بعد"); return }
    setSimOrder(data.people.sort((a: any, b: any) => a.round - b.round || a.number - b.number))
    setSimulatingRanker(rankerNum)
  }

  const saveSimulate = (rankerNum: number) => {
    if (previewEventId != null) { toast.error("لا يمكن تعديل التصنيفات في وضع المعاينة"); return }
    run(`save-sim-${rankerNum}`, () => api("e3-set-ranking", { ranker_number: rankerNum, ranked_list: simOrder.map(i => i.number) }).then(d => { if (!d.error) { setSimulatingRanker(null); fetchRankStatus(); toast.success("تم حفظ التصنيف بالنيابة") } return d }))
  }

  const doSwap = (numB: number) => {
    if (previewEventId != null) { toast.error("لا يمكن تعديل الجلسات في وضع المعاينة"); return }
    run(`swap-${swapA}-${numB}`, () => api("e3-swap-seating", { num_a: swapA, num_b: numB }).then(d => { if (!d.error) { setSwapA(null); fetchSeating() } return d }))
  }

  const doMove = (targetTable: number) => {
    if (!moveA || !mapRound) return
    if (previewEventId != null) { toast.error("لا يمكن تعديل الجلسات في وضع المعاينة"); return }
    run(`move-${moveA}-to-${targetTable}`, () => api("e3-move-table", { participant_number: moveA, round: mapRound, new_table: targetTable }).then(d => { if (!d.error) { setMoveA(null); fetchSeating() } return d }))
  }

  const doSwapMatch = () => {
    if (!swapMatch || !swapReplacement) return
    if (previewEventId != null) { toast.error("لا يمكن تعديل المطابقات في وضع المعاينة"); return }
    run(`swap-match-${swapMatch.missingNum}-${swapReplacement}`, () =>
      api("e3-swap-match-partner", {
        phase: swapMatch.phase,
        missing_participant: swapMatch.missingNum,
        replacement_participant: swapReplacement,
      }).then(d => {
        if (!d.error) {
          setSwapMatch(null)
          setSwapReplacement(null)
          fetchMatches()
          fetchState()
        }
        return d
      })
    )
  }

  const doReplaceParticipant = () => {
    if (!replaceParticipant || !replaceWith) return
    if (previewEventId != null) { toast.error("لا يمكن تعديل في وضع المعاينة"); return }
    run(`replace-${replaceParticipant.oldNum}-${replaceWith}`, () =>
      api("e3-replace-participant", {
        old_participant: replaceParticipant.oldNum,
        new_participant: replaceWith,
      }).then(d => {
        if (!d.error) {
          setReplaceParticipant(null)
          setReplaceWith(null)
          setParticipantPanelOpen(false)
          fetchParticipants()
          fetchSeating()
          fetchMatches()
          fetchState()
          fetchRankStatus()
          toast.success(d.message)
        }
        return d
      })
    )
  }

  const handleMemberClick = (m: any) => {
    if (swapA) {
      if (swapA === m.number) setSwapA(null)
      else doSwap(m.number)
    } else if (moveA) {
      if (moveA === m.number) setMoveA(null)
      else { setMoveA(null); setSwapA(null); setSelectedParticipantNum(m.number); setParticipantPanelOpen(true) }
    } else {
      setSelectedParticipantNum(m.number)
      setParticipantPanelOpen(true)
    }
  }

  const handleTableClick = (table: number) => {
    if (moveA) {
      doMove(table)
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
    if (ph === "setup" && hasSeating) return { label: "⬅ بدء الجولة الأولى (30 دقيقة)", action: () => setPhaseWithTimer("round1", 1800, 1), ready: true }
    if (ph === "round1") return { label: "⬅ التصنيف بعد الجولة 1 (5 دقائق)", action: () => setPhaseWithTimer("ranking1", 300, 0), ready: true }
    if (ph === "ranking1") return { label: "⬅ بدء الجولة الثانية (25 دقيقة)", action: () => setPhaseWithTimer("round2", 1500, 2), ready: true }
    if (ph === "round2") return { label: "⬅ التصنيف النهائي (5 دقائق)", action: () => setPhaseWithTimer("ranking2", 300, 0), ready: true }
    if (ph === "ranking2" && !hasMatches) return { label: "⬅ تشغيل مطابقة اختيار المشاركين", action: () => setPhaseStopTimer("phase2_processing").then(() => run("phase2", () => api("e3-trigger-phase2-matching").then(d => { fetchMatches(); fetchState(); return d }))), ready: ranked > 0 }
    if (ph === "phase2_processing" && hasMatches) return { label: "⬅ استراحة (10 دقائق)", action: () => setPhaseWithTimer("break", 600, 3), ready: true }
    if (ph === "phase2_processing") return { label: "⏳ جاري المطابقة...", action: () => {}, ready: false }
    if (ph === "ranking2" && hasMatches) return { label: "⬅ استراحة (10 دقائق)", action: () => setPhaseWithTimer("break", 600, 3), ready: true }
    if (ph === "break") return { label: "⬅ بدء كشف المرحلة 2 (21 دقيقة)", action: () => setPhaseWithTimer("phase2_reveal", 1260, 4), ready: true }
    if (ph === "phase2_reveal" && !state.phase3_matches_done) return { label: "⬅ تشغيل مطابقة الخوارزمية", action: () => { if (previewEventId != null) { toast.error("لا يمكن تشغيل المطابقة في وضع المعاينة"); return } run("phase3", () => api("e3-trigger-phase3-matching").then(d => { fetchState(); return d })) }, ready: ranked > 0 }
    if (ph === "phase2_reveal" && state.phase3_matches_done) return { label: "⬅ كشف المرحلة 3 (21 دقيقة)", action: () => setPhaseWithTimer("phase3_reveal", 1260, 5), ready: true }
    if (ph === "phase3_reveal") return { label: "⬅ الكشف النهائي ✨", action: () => setPhase("final_reveal"), ready: true }
    return null
  }

  const generateSeating = () => { if (previewEventId != null) { toast.error("لا يمكن توليد الجلسات في وضع المعاينة"); return } run("seating", async () => {
    const data = await api("e3-generate-seating")
    if (!data.error) { fetchSeating(); fetchParticipants() }
    return data
  }) }

  const saveParticipants = () => { if (previewEventId != null) { toast.error("لا يمكن تعديل المشاركين في وضع المعاينة"); return } run("save-participants", async () => {
    if (selectedNumbers.size < 4)
      return { error: `يجب اختيار 4 مشاركين على الأقل (تم اختيار ${selectedNumbers.size})` }
    const data = await api("e3-set-participants", { participant_numbers: Array.from(selectedNumbers) })
    if (!data.error) fetchParticipants()
    return data
  }) }

  const triggerPhase2 = () => { if (previewEventId != null) { toast.error("لا يمكن تشغيل المطابقة في وضع المعاينة"); return } setPhaseStopTimer("phase2_processing").then(() => run("phase2", () => api("e3-trigger-phase2-matching").then(d => { fetchMatches(); fetchState(); return d }))) }
  const triggerPhase3 = () => { if (previewEventId != null) { toast.error("لا يمكن تشغيل المطابقة في وضع المعاينة"); return } const tid = toast.loading("جاري حساب توافق المشاركين..."); run("phase3", async () => { const d = await api("e3-trigger-phase3-matching"); toast.dismiss(tid); return d }) }

  const togglePhase2Exclusion = (num: number) => {
    if (previewEventId != null) { toast.error("لا يمكن تعديل الاستبعادات في وضع المعاينة"); return }
    run(`phase2-exclude-${num}`, () => api("e3-toggle-phase2-exclusion", { participant_number: num }).then(d => { if (!d.error) fetchParticipants(); return d }))
  }
  const resetEvent = () => {
    if (previewEventId != null) { toast.error("لا يمكن إعادة التعيين في وضع المعاينة"); return }
    if (!confirm("هل أنت متأكد من إعادة تعيين الفعالية؟ سيتم حذف جميع البيانات.")) return
    run("reset", async () => {
      const d = await api("e3-reset-event")
      if (!d.error) { fetchState(); fetchParticipants(); setSeating(null); setRankStatus(null) }
      return d
    })
  }

  const clearTestData = () => {
    if (previewEventId != null) { toast.error("لا يمكن حذف البيانات في وضع المعاينة"); return }
    if (!confirm("حذف التصنيفات والكلمات والفيدبك فقط؟ سيتم الاحتفاظ بالمشاركين والجلسات والمطابقة.")) return
    run("clear-test", async () => {
      const d = await api("e3-clear-test-data")
      if (!d.error) { fetchState(); fetchRankStatus(); fetchMatches() }
      return d
    })
  }

  const startTestMode = async () => {
    if (previewEventId != null) { toast.error("لا يمكن بدء وضع الاختبار في وضع المعاينة"); return }
    if (!confirm("بدء وضع الاختبار؟ سيتم اختيار 36 مشارك (18 ذكر + 18 أنثى) وتحقيق 100% تغطية كاش — قد يستغرق حساب الأزواج الناقصة بعض الوقت. يمكنك الاستعادة عند الانتهاء.")) return
    setTestModeLoading(true)
    try {
      const data = await api("e3-start-test-mode")
      if (data.error) { toast.error(data.error); return }
      setTestMode(true)
      setTestModeData(data)
      toast.success(data.message || "وضع الاختبار بدأ")
      fetchState(); fetchParticipants()
    } catch (e: any) {
      toast.error(e.message || "خطأ")
    } finally {
      setTestModeLoading(false)
    }
  }

  const endTestMode = async () => {
    if (!confirm("إنهاء وضع الاختبار؟ سيتم استعادة جميع البيانات الأصلية وحذف أي تغييرات في وضع الاختبار.")) return
    setTestModeLoading(true)
    try {
      const data = await api("e3-end-test-mode")
      if (data.error) { toast.error(data.error); return }
      setTestMode(false)
      setTestModeData(null)
      toast.success(data.message || "تم إنهاء وضع الاختبار")
      fetchState(); fetchParticipants(); setSeating(null); setRankStatus(null)
    } catch (e: any) {
      toast.error(e.message || "خطأ")
    } finally {
      setTestModeLoading(false)
    }
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
    const matchPaid = paidFilter === "all" || (paidFilter === "paid" && p.paid) || (paidFilter === "unpaid" && !p.paid)
    return matchSearch && matchGender && matchPaid
  })

  const selectAllPaid = () => {
    const paidNums = participants.filter(p => p.paid).map(p => p.number)
    setSelectedNumbers(new Set(paidNums))
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">✨</div>
            <h1 className="text-xl font-bold text-white">التوافق الأعمى 4.0</h1>
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
      <header className="border-b border-gray-800 bg-gray-900 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xl sm:text-2xl">✨</span>
          <div>
            <h1 className="text-sm sm:text-lg font-bold">التوافق الأعمى 4.0</h1>
            <p className="text-[10px] sm:text-xs text-gray-400">لوحة التحكم</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {state && (
            <div className="hidden sm:flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
              <div className={`w-2 h-2 rounded-full ${state.phase !== "setup" ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
              <span className="text-sm text-gray-300">
                {PHASES.find(p => p.id === state?.phase)?.label || "—"}
              </span>
            </div>
          )}
          <button onClick={async () => {
            setSosModalOpen(true)
            const pending = sosRequests.filter(r => r.status === 'pending')
            if (pending.length > 0) {
              await api("e3-sos-mark-seen")
              setSosRequests(prev => prev.map(r => r.status === 'pending' ? { ...r, status: 'seen' } : r))
            }
          }}
            className="relative p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
            <MessageSquare size={18} />
            {sosRequests.filter(r => r.status !== 'resolved').length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] flex items-center justify-center text-white font-bold animate-pulse">
                {sosRequests.filter(r => r.status !== 'resolved').length}
              </span>
            )}
          </button>
          <button onClick={logout} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">

        {/* Migration Warning */}
        {migrationErrors && migrationErrors.length > 0 && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-red-300 font-semibold text-sm">
              <AlertTriangle size={16} /> تنبيه: لم يتم تشغيل SQL Migration
            </div>
            <div className="text-xs text-red-400/80">
              يجب تشغيل ملف <code className="bg-red-950/50 px-1.5 py-0.5 rounded">database/event3_add_event_id.sql</code> في Supabase SQL Editor لإضافة عمود <code className="bg-red-950/50 px-1.5 py-0.5 rounded">event_id</code> للجداول.
            </div>
            <div className="text-xs text-red-400/60">
              الأخطاء: {migrationErrors.join(" | ")}
            </div>
          </div>
        )}

        {/* Event Selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2">
            <Calendar size={16} className="text-purple-400" />
            <span className="text-xs text-gray-400">الفعالية:</span>
            <select
              value={previewEventId ?? realCurrentEventId}
              onChange={async (e) => {
                const val = Number(e.target.value)
                if (val === realCurrentEventId) {
                  setPreviewEventId(null)
                  setPreviewEventIdState(null)
                } else {
                  setPreviewEventId(val)
                  setPreviewEventIdState(val)
                }
                // Refetch all data for the selected event
                fetchState()
                fetchParticipants()
                fetchSeating()
                fetchRankStatus()
                if (activeTab === "overview") fetchOverview()
                if (activeTab === "feedback") { fetchFeedback(); fetchMoodChecks(); fetchNotifications() }
                if (activeTab === "attendance") fetchAttendance()
                if (activeTab === "aiwelcome") fetchAiWelcome()
              }}
              className="bg-gray-800 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-700 focus:border-purple-500 focus:outline-none cursor-pointer"
            >
              {eventList.length === 0 && <option value={realCurrentEventId}>الفعالية {realCurrentEventId}</option>}
              {eventList.map(eid => (
                <option key={eid} value={eid}>
                  فعالية {eid}{eid === realCurrentEventId ? " (نشطة)" : ""}
                </option>
              ))}
            </select>
          </div>
          {testMode && (
            <span className="text-xs bg-amber-500/20 border border-amber-600/40 text-amber-300 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
              <FlaskConical size={12} /> وضع الاختبار
            </span>
          )}
          {previewEventId != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-amber-900/40 border border-amber-700/40 text-amber-300 px-2.5 py-1 rounded-full font-medium">
                👁️ معاينة فعالية {previewEventId}
              </span>
              <button
                onClick={() => {
                  setPreviewEventId(null)
                  setPreviewEventIdState(null)
                  fetchState()
                  fetchParticipants()
                  fetchSeating()
                  fetchRankStatus()
                  if (activeTab === "overview") fetchOverview()
                  if (activeTab === "feedback") { fetchFeedback(); fetchMoodChecks(); fetchNotifications() }
                  if (activeTab === "attendance") fetchAttendance()
                  if (activeTab === "aiwelcome") fetchAiWelcome()
                }}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white px-2.5 py-1 rounded-full border border-gray-700 transition-colors"
              >
                عودة للفعالية النشطة
              </button>
            </div>
          )}
        </div>

        {/* Phase Progress */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
          <h2 className="text-xs sm:text-sm font-medium text-gray-400 mb-2 sm:mb-3">مراحل الفعالية</h2>
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
            {PHASES.map((phase, idx) => (
              <div key={phase.id} className="flex items-center gap-1 flex-shrink-0">
                <div className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all ${
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
            {[
              { label: "المشاركون المختارون", value: `${state.participants_selected}`, icon: Users, ok: (state.participants_selected || 0) >= 6 },
              { label: "خطة الجلسات", value: state.seating_generated ? "جاهزة ✓" : "لم تُولَّد", icon: Grid3x3, ok: state.seating_generated },
              { label: "التصنيفات المقدمة", value: `${state.rankings_submitted}/${state.participants_selected || 0}`, icon: BarChart3, ok: state.rankings_submitted > 0 && state.rankings_submitted >= (state.participants_selected || 1) },
              { label: "مطابقات المرحلة 2", value: state.phase2_matches_done ? "جاهزة ✓" : "—", icon: Trophy, ok: state.phase2_matches_done },
              { label: "مطابقات الخوارزمية", value: state.phase3_matches_done ? "جاهزة ✓" : "—", icon: Brain, ok: state.phase3_matches_done },
            ].map(stat => (
              <div key={stat.label} className={`bg-gray-900 border rounded-xl p-3 sm:p-4 ${stat.ok ? "border-green-800" : "border-gray-800"}`}>
                <div className="flex items-center justify-between mb-1">
                  <stat.icon size={14} className={stat.ok ? "text-green-400" : "text-gray-500"} />
                  <span className={`text-base sm:text-lg font-bold ${stat.ok ? "text-green-400" : "text-white"}`}>{stat.value}</span>
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Phase 3 assignment mismatch warning */}
        {phase3MissingCount > 0 && (
          <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-3 sm:p-4 flex items-start gap-3">
            <AlertTriangle className="text-red-400 flex-shrink-0 mt-0.5" size={18} />
            <div className="flex-1">
              <p className="text-red-300 font-semibold text-sm">{phase3MissingCount} مشارك مختار ليس له طاولة في المرحلة 3</p>
              <p className="text-red-400/70 text-xs mt-0.5">المطابقات تم إنشاؤها لكن بعض المشاركين غير مسندين إلى طاولة. أعد تشغيل مطابقة المرحلة 3 أو راجع الأزواج المثبتة.</p>
            </div>
          </div>
        )}

        {/* Test Mode Panel */}
        <div className={`border rounded-xl p-3 sm:p-4 ${testMode ? "bg-amber-950/30 border-amber-700/50" : "bg-gray-900 border-gray-800"}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FlaskConical className={testMode ? "text-amber-400" : "text-gray-400"} size={18} />
              <h2 className="text-sm font-medium text-gray-300">وضع الاختبار</h2>
              {testMode && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-600/40">نشط</span>
              )}
            </div>
            <div className="flex gap-2">
              {!testMode ? (
                <button
                  onClick={startTestMode}
                  disabled={testModeLoading || !!loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {testModeLoading ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
                  بدء وضع الاختبار
                </button>
              ) : (
                <button
                  onClick={endTestMode}
                  disabled={testModeLoading || !!loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {testModeLoading ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                  إنهاء وحذف
                </button>
              )}
            </div>
          </div>

          {testMode && testModeData && (
            <div className="space-y-3">
              {/* Test mode info banner */}
              <div className="bg-amber-950/40 border border-amber-800/40 rounded-lg p-2.5 text-xs text-amber-300/80">
                <p>⚠️ أنت في وضع الاختبار. جميع البيانات مؤقتة وسيتم حذفها عند الإنهاء.</p>
              </div>

              {/* Cache coverage */}
              {testModeData.cache_coverage && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400">تغطية الكاش:</span>
                  <span className={testModeData.cache_coverage.percent >= 100 ? "text-green-400" : "text-yellow-400"}>
                    {testModeData.cache_coverage.hits}/{testModeData.cache_coverage.total} ({testModeData.cache_coverage.percent}%)
                  </span>
                </div>
              )}

              {/* Diagnostics checks */}
              {testModeData.checks && (
                <div className="space-y-1">
                  {testModeData.checks.map((check: any, i: number) => (
                    <div key={i} className={`flex items-start gap-2 text-xs p-2 rounded-lg ${check.status === "ok" ? "bg-green-950/30 text-green-300" : check.status === "warn" ? "bg-yellow-950/30 text-yellow-300" : "bg-red-950/30 text-red-300"}`}>
                      {check.status === "ok" ? <Check size={12} className="mt-0.5" /> : <AlertTriangle size={12} className="mt-0.5" />}
                      <span>{check.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Test users with phone numbers */}
              {testModeData.test_users && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-400">مستخدمون للاختبار — سجل دخول برقم الجوال:</h3>
                    <input
                      type="text"
                      value={testUsersFilter}
                      onChange={e => setTestUsersFilter(e.target.value)}
                      placeholder="بحث..."
                      className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-amber-500 outline-none w-24"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1 scrollbar-thin">
                    {testModeData.test_users
                      .filter((u: any) => !testUsersFilter || String(u.name).includes(testUsersFilter) || String(u.number).includes(testUsersFilter) || String(u.phone || "").includes(testUsersFilter))
                      .map((u: any) => (
                      <div key={u.number} className="flex items-center justify-between bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${u.gender?.toLowerCase().startsWith("m") ? "bg-blue-900/60 text-blue-300" : "bg-pink-900/60 text-pink-300"}`}>
                            {u.gender?.toLowerCase().startsWith("m") ? "♂" : "♀"}
                          </span>
                          <span className="text-gray-300 font-medium">#{u.number} {u.name}</span>
                          <span className="text-gray-500">({u.age})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {u.phone ? (
                            <a
                              href={`/event3?token=${encodeURIComponent(u.token)}&impersonate=1`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-gray-400 font-mono hover:text-amber-400 transition-colors cursor-pointer"
                              dir="ltr"
                              title="تسجيل دخول ك هذا المشارك"
                            >
                              <Phone size={11} />
                              {u.phone}
                            </a>
                          ) : (
                            <span className="text-red-400/60 text-[10px]">لا يوجد رقم</span>
                          )}
                          <button
                            onClick={() => { if (u.phone) { navigator.clipboard.writeText(u.phone); toast.success("تم نسخ الرقم") } }}
                            className="text-gray-500 hover:text-amber-400 transition-colors"
                            title="نسخ الرقم"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!testMode && (
            <p className="text-xs text-gray-500">
              يختار 20 ذكر و 20 أنثى عشوائياً من المشاركين الذين أكملوا الاستبيان. يحذف جميع بيانات الاختبار عند الإنهاء.
            </p>
          )}
        </div>

        {/* Pre-event diagnostics */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="text-purple-400" size={18} />
              <h2 className="text-sm font-medium text-gray-300">فحص ما قبل الفعالية</h2>
            </div>
            <button
              onClick={runDiagnostics}
              disabled={diagnosticsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-medium transition-colors disabled:opacity-50"
            >
              {diagnosticsLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              تشغيل الفحص
            </button>
          </div>
          {diagnostics && (
            <div className="space-y-2">
              <div className={`flex items-center gap-2 text-sm font-semibold ${diagnostics.healthy ? "text-green-400" : "text-red-400"}`}>
                {diagnostics.healthy ? <Check size={16} /> : <AlertTriangle size={16} />}
                {diagnostics.healthy ? "جاهز للبدء" : "هناك مشاكل تحتاج المعالجة"}
              </div>
              <div className="space-y-1">
                {diagnostics.checks.map((check, i) => (
                  <div key={i} className={`flex items-start gap-2 text-xs p-2 rounded-lg ${check.status === "ok" ? "bg-green-950/30 text-green-300" : check.status === "warn" ? "bg-yellow-950/30 text-yellow-300" : "bg-red-950/30 text-red-300"}`}>
                    {check.status === "ok" ? <Check size={14} className="mt-0.5" /> : check.status === "warn" ? <AlertTriangle size={14} className="mt-0.5" /> : <XCircle size={14} className="mt-0.5" />}
                    <span>{check.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Post-event report */}
        {state?.phase === "final_reveal" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="text-amber-400" size={18} />
                <h2 className="text-sm font-medium text-gray-300">تقرير ما بعد الفعالية</h2>
              </div>
              <button
                onClick={generateReport}
                disabled={reportLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {reportLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                إنشاء التقرير
              </button>
              {report && (
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = `event3-report-event-${report.event_id}.json`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors"
                >
                  <Download size={16} />
                  JSON
                </button>
              )}
            </div>
            {report && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-white">{report.match_summary?.phase2_pairs ?? 0}</div>
                    <div className="text-[10px] text-gray-500">أزواج المرحلة 2</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-white">{report.match_summary?.phase3_pairs ?? 0}</div>
                    <div className="text-[10px] text-gray-500">أزواج المرحلة 3</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-green-400">{report.match_summary?.mutual_choice_pairs ?? 0}</div>
                    <div className="text-[10px] text-gray-500">اختيار متبادل</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-pink-400">{report.match_summary?.avg_phase3_score ?? 0}</div>
                    <div className="text-[10px] text-gray-500">متوسط التوافق</div>
                  </div>
                </div>
                {(report.most_ranked?.length > 0 || report.least_ranked?.length > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="bg-green-950/20 border border-green-800/30 rounded-lg p-2.5">
                      <p className="text-green-400 text-xs font-semibold mb-1">الأكثر تقييماً</p>
                      <div className="space-y-0.5">
                        {report.most_ranked.map((p: any) => (
                          <div key={p.number} className="flex justify-between text-xs text-gray-300"><span>{p.name}</span><span>{p.count} تصنيف</span></div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-red-950/20 border border-red-800/30 rounded-lg p-2.5">
                      <p className="text-red-400 text-xs font-semibold mb-1">الأقل تقييماً</p>
                      <div className="space-y-0.5">
                        {report.least_ranked.map((p: any) => (
                          <div key={p.number} className="flex justify-between text-xs text-gray-300"><span>{p.name}</span><span>{p.count} تصنيف</span></div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {report.mood_summary && (
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-500">المزاج:</span>
                    <span className="text-green-400">{report.mood_summary.good} جيد</span>
                    <span className="text-yellow-400">{report.mood_summary.neutral} محايد</span>
                    <span className="text-red-400">{report.mood_summary.bad} سيء</span>
                    <span className="text-gray-500">{report.mood_summary.unanswered} بدون رد</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Conflict-of-interest exclusions */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-3">
            <Ban className="text-orange-400" size={18} />
            <h2 className="text-sm font-medium text-gray-300">استثناءات تضارب المصالح</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <select value={exclusionA} onChange={e => setExclusionA(e.target.value ? parseInt(e.target.value) : "")} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500">
              <option value="">اختر مشاركاً</option>
              {participants.filter(p => p.selected).map(p => (
                <option key={`a-${p.number}`} value={p.number}>{p.number} — {p.name}</option>
              ))}
            </select>
            <select value={exclusionB} onChange={e => setExclusionB(e.target.value ? parseInt(e.target.value) : "")} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500">
              <option value="">اختر مشاركاً آخر</option>
              {participants.filter(p => p.selected).map(p => (
                <option key={`b-${p.number}`} value={p.number}>{p.number} — {p.name}</option>
              ))}
            </select>
            <input
              type="text"
              value={exclusionReason}
              onChange={e => setExclusionReason(e.target.value)}
              placeholder="السبب (اختياري)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={addExclusion}
              disabled={!exclusionA || !exclusionB || exclusionA === exclusionB || loading === "add-exclusion"}
              className="px-4 py-2 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              إضافة
            </button>
          </div>
          {exclusions.length > 0 ? (
            <div className="space-y-1">
              {exclusions.map(ex => (
                <div key={ex.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-800/50 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-white">#{ex.participant_a_number}</span>
                    <span className="text-gray-500">↔</span>
                    <span className="text-white">#{ex.participant_b_number}</span>
                    {ex.reason && <span className="text-gray-500">— {ex.reason}</span>}
                  </div>
                  <button onClick={() => removeExclusion(ex.id)} className="text-red-400 hover:text-red-300 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-xs">لا توجد استثناءات محددة</p>
          )}
        </div>

        {/* Timer */}
        {state?.timer_active && (
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl overflow-hidden">
            <div className="p-3 sm:p-4 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 sm:gap-3">
                <Clock size={18} className="text-blue-400 animate-pulse" />
                <div>
                  <p className="font-medium text-sm sm:text-base text-blue-300">المؤقت نشط</p>
                  <p className="text-[10px] sm:text-xs text-gray-400">الجولة {state.timer_round} · {formatTime(timerRemaining)} متبقية</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`text-2xl sm:text-3xl font-mono font-bold ${timerRemaining < 120 ? 'text-red-400' : 'text-blue-300'}`}>{formatTime(timerRemaining)}</div>
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1">
                    <button onClick={() => adjustTimer(300)} disabled={!!loading} className="bg-emerald-600/60 hover:bg-emerald-500 text-white rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40 transition-colors">+5د</button>
                    <button onClick={() => adjustTimer(120)} disabled={!!loading} className="bg-emerald-700/60 hover:bg-emerald-600 text-white rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40 transition-colors">+2د</button>
                    <button onClick={() => adjustTimer(60)} disabled={!!loading} className="bg-emerald-800/60 hover:bg-emerald-700 text-white rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40 transition-colors">+1د</button>
                    <button onClick={() => adjustTimer(30)} disabled={!!loading} className="bg-emerald-900/60 hover:bg-emerald-800 text-white rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40 transition-colors">+30ث</button>
                    <button onClick={() => adjustTimer(10)} disabled={!!loading} className="bg-emerald-950/60 hover:bg-emerald-900 text-white rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40 transition-colors">+10ث</button>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => adjustTimer(-300)} disabled={!!loading} className="bg-orange-600/60 hover:bg-orange-500 text-white rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40 transition-colors">-5د</button>
                    <button onClick={() => adjustTimer(-120)} disabled={!!loading} className="bg-orange-700/60 hover:bg-orange-600 text-white rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40 transition-colors">-2د</button>
                    <button onClick={() => adjustTimer(-60)} disabled={!!loading} className="bg-orange-800/60 hover:bg-orange-700 text-white rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40 transition-colors">-1د</button>
                    <button onClick={() => adjustTimer(-30)} disabled={!!loading} className="bg-orange-900/60 hover:bg-orange-800 text-white rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40 transition-colors">-30ث</button>
                    <button onClick={() => adjustTimer(-10)} disabled={!!loading} className="bg-orange-950/60 hover:bg-orange-900 text-white rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40 transition-colors">-10ث</button>
                  </div>
                </div>
                <button onClick={stopTimer} disabled={!!loading} className="bg-red-600/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm flex items-center gap-2">
                  <Square size={14} /> إيقاف
                </button>
              </div>
            </div>
            <div className="h-1.5 bg-blue-950/60">
              <div
                className={`h-full transition-all duration-1000 ${timerRemaining < 120 ? 'bg-red-500' : 'bg-blue-400'}`}
                style={{ width: `${Math.min(100, (timerRemaining / (state.timer_duration || 1260)) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 sm:gap-2 border-b border-gray-800 overflow-x-auto scrollbar-thin">
          {[
            { id: "control",      label: "التحكم",     icon: Play },
            { id: "seating",      label: "خريطة الجلسات", icon: Table2 },
            { id: "participants", label: "المشاركون",  icon: Users },
            { id: "ranking",      label: "التصنيفات",  icon: BarChart3 },
            { id: "overview",     label: "نظرة شاملة", icon: Layers },
            { id: "feedback",     label: "التقييمات",   icon: Star },
            { id: "attendance",   label: "الحضور",      icon: CheckCircle },
            { id: "aiwelcome",    label: "ترحيب AI",     icon: Sparkles },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as any); if (tab.id === "ranking" || tab.id === "overview") fetchRankStatus(); if (tab.id === "feedback") fetchFeedback() }}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 border-b-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
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

            {/* Preview Mode Banner */}
            {previewEventId != null && (
              <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-3 flex items-center gap-2">
                <Eye size={16} className="text-amber-400" />
                <span className="text-sm text-amber-300 font-medium">أنت في وضع المعاينة للفعالية {previewEventId} — جميع إجراءات التحكم معطّلة</span>
              </div>
            )}

            {/* Participant Selection */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                  <Users size={16} className="text-purple-400" /> اختيار المشاركين
                </h3>
                <div className="flex items-center gap-2">
                  <span className={`text-sm px-2 py-0.5 rounded-full ${selectedNumbers.size >= 6 ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-400"}`}>
                    {selectedNumbers.size} مختار
                  </span>
                  {selectedNumbers.size > 0 && (() => {
                    const sel = participants.filter(p => selectedNumbers.has(p.number))
                    const males = sel.filter(p => (p.gender || '').toLowerCase() !== 'female').length
                    const females = sel.filter(p => (p.gender || '').toLowerCase() === 'female').length
                    const ages = sel.map(p => p.age).filter(a => a && a !== "?").sort((a, b) => a - b)
                    const ageRange = ages.length > 0 ? `${ages[0]}-${ages[ages.length - 1]}` : "?"
                    return (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 flex items-center gap-1.5">
                        <span className="text-blue-400">{males}♂</span>
                        <span className="text-pink-400">{females}♀</span>
                        <span className="text-amber-400">{ageRange}سنة</span>
                      </span>
                    )
                  })()}
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

              <div className="flex gap-2 mb-3 flex-wrap">
                <input
                  type="text"
                  placeholder="ابحث بالاسم أو الرقم..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="flex-1 min-w-[120px] bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:border-purple-500"
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
                <select
                  value={paidFilter}
                  onChange={e => setPaidFilter(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">الجميع</option>
                  <option value="paid">مدفوع</option>
                  <option value="unpaid">غير مدفوع</option>
                </select>
                <button
                  onClick={selectAllPaid}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-1.5 whitespace-nowrap"
                >
                  <CheckCircle size={14} />
                  اختيار كل المدفوعين
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-60 sm:max-h-72 overflow-y-auto">
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
                      <div className="font-medium truncate flex items-center gap-1">
                        {p.name}
                        {p.paid && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" title="مدفوع" />}
                      </div>
                      <div className="text-gray-500">#{p.number} · {p.age || "?"}{p.paid ? " · مدفوع" : ""}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Phase & Timer Controls */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-5">
              <h3 className="font-semibold flex items-center gap-2 mb-3 sm:mb-4 text-sm sm:text-base">
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
                    desc: "30 دقيقة",
                    action: () => setPhaseWithTimer("round1", 1800, 1),
                    icon: Play,
                    color: "green",
                    enabled: state?.seating_generated,
                    loadKey: "phase-round1",
                  },
                  {
                    label: "التصنيف بعد الجولة 1",
                    desc: "5 دقائق",
                    action: () => setPhaseWithTimer("ranking1", 300, 0),
                    icon: BarChart3,
                    color: "yellow",
                    enabled: true,
                    loadKey: "phase-ranking1",
                  },
                  {
                    label: "بدء الجولة الثانية",
                    desc: "25 دقيقة",
                    action: () => setPhaseWithTimer("round2", 1500, 2),
                    icon: Play,
                    color: "green",
                    enabled: true,
                    loadKey: "phase-round2",
                  },
                  {
                    label: "التصنيف بعد الجولة 2",
                    desc: "5 دقائق",
                    action: () => setPhaseWithTimer("ranking2", 300, 0),
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
                    enabled: testMode || (state?.rankings_submitted || 0) > 0,
                    loadKey: "phase2",
                  },
                  {
                    label: "استراحة",
                    desc: "10 دقائق",
                    action: () => setPhaseWithTimer("break", 600, 3),
                    icon: Coffee,
                    color: "orange",
                    enabled: state?.phase2_matches_done,
                    loadKey: "phase-break",
                  },
                  {
                    label: "كشف المرحلة 2",
                    desc: "21 دقيقة",
                    action: () => setPhaseWithTimer("phase2_reveal", 1260, 4),
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
                    desc: "21 دقيقة",
                    action: () => setPhaseWithTimer("phase3_reveal", 1260, 5),
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
                  {
                    label: "الفعالية ستبدأ قريباً",
                    desc: "إعادة المشاركين لشاشة الانتظار",
                    action: () => setPhase("setup"),
                    icon: Home,
                    color: "gray",
                    enabled: true,
                    loadKey: "phase-setup",
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

            {/* Quick Phase Advance (test mode only) */}
            {testMode && (
              <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-3">
                <p className="text-amber-400/70 text-xs mb-2 font-medium flex items-center gap-1.5"><FlaskConical size={12} /> انتقال سريع للمراحل (وضع الاختبار)</p>
                <div className="flex flex-wrap gap-1.5">
                  {PHASES.map((phase, idx) => {
                    const isCurrent = (state?.phase || "setup") === phase.id
                    const isPast = idx < currentPhaseIdx
                    return (
                      <button
                        key={phase.id}
                        onClick={() => {
                          if (phase.id === "phase2_processing" || phase.id === "phase3_processing") return
                          if (phase.id === "setup") setPhase("setup")
                          else if (phase.id === "final_reveal") setPhase("final_reveal")
                          else if (phase.id === "break") setPhaseWithTimer("break", 600, 3)
                          else if (phase.id === "round1") setPhaseWithTimer("round1", 1800, 1)
                          else if (phase.id === "ranking1") setPhaseWithTimer("ranking1", 300, 0)
                          else if (phase.id === "round2") setPhaseWithTimer("round2", 1500, 2)
                          else if (phase.id === "ranking2") setPhaseWithTimer("ranking2", 300, 0)
                          else if (phase.id === "phase2_reveal") setPhaseWithTimer("phase2_reveal", 1260, 4)
                          else if (phase.id === "phase3_reveal") setPhaseWithTimer("phase3_reveal", 1260, 5)
                          else setPhase(phase.id)
                        }}
                        disabled={!!loading || isCurrent}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-30 ${
                          isCurrent ? "bg-amber-600 text-white" :
                          isPast ? "bg-gray-700 text-green-400 hover:bg-gray-600" :
                          "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        }`}
                      >
                        <span className="ml-1">{phase.icon}</span>{phase.label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-1.5 mt-2">
                  <button
                    onClick={() => run("phase2", () => api("e3-trigger-phase2-matching").then(d => { fetchMatches(); fetchState(); return d }))}
                    disabled={!!loading}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-purple-900/50 hover:bg-purple-900/70 text-purple-300 transition-all disabled:opacity-40"
                  >
                    ⚡ مطابقة المرحلة 2
                  </button>
                  <button
                    onClick={() => run("phase3", () => api("e3-trigger-phase3-matching").then(d => { fetchState(); return d }))}
                    disabled={!!loading}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-purple-900/50 hover:bg-purple-900/70 text-purple-300 transition-all disabled:opacity-40"
                  >
                    ⚡ مطابقة الخوارزمية
                  </button>
                  <button
                    onClick={() => { if (previewEventId != null) { toast.error("لا يمكن إيقاف المؤقت في وضع المعاينة"); return } run("timer-stop", () => api("e3-stop-timer")) }}
                    disabled={!!loading}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-red-900/40 hover:bg-red-900/60 text-red-300 transition-all disabled:opacity-40"
                  >
                    ⏹ إيقاف المؤقت
                  </button>
                </div>
              </div>
            )}

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

            {/* Mood Check Trigger */}
            <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/20 border border-purple-700/40 rounded-xl p-4">
              <h3 className="font-semibold text-purple-300 flex items-center gap-2 mb-3 text-sm">
                <Heart size={16} /> فحص المزاج اللحظي
              </h3>
              <p className="text-purple-400/60 text-xs mb-3">أرسل popup فوري للمشاركين لمعرفة شعورهم في اللحظة الحالية</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={moodTarget}
                  onChange={e => setMoodTarget(e.target.value)}
                  placeholder="رقم مشارك (اتركه فارغ للجميع)"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <button
                  onClick={sendMoodCheck}
                  disabled={moodSending}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {moodSending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                  إرسال
                </button>
              </div>
              {/* Mood check preview */}
              {moodTarget && (
                <div className="mt-2 bg-gray-800/50 border border-purple-800/30 rounded-lg p-2.5">
                  <p className="text-[10px] text-gray-500 mb-1.5">معاينة:</p>
                  <div className="bg-purple-950/40 border border-purple-700/40 rounded-lg p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-purple-600/30 flex items-center justify-center flex-shrink-0">
                      <Heart size={18} className="text-purple-300" />
                    </div>
                    <div className="flex-1">
                      <p className="text-purple-200 text-sm font-semibold">فحص المزاج</p>
                      <p className="text-purple-400/60 text-xs">سيتم الإرسال إلى: <span className="text-amber-400 font-semibold">المشارك #{moodTarget}</span></p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Notification Trigger */}
            <div className="bg-gradient-to-r from-blue-900/30 to-indigo-900/20 border border-blue-700/40 rounded-xl p-4">
              <h3 className="font-semibold text-blue-300 flex items-center gap-2 mb-3 text-sm">
                <Bell size={16} /> إرسال إشعار
              </h3>
              <p className="text-blue-400/60 text-xs mb-3">رسالة سريعة تظهر للمشاركين (بدون رد)</p>
              <div className="space-y-2">
                <input
                  type="text"
                  value={notifTitle}
                  onChange={e => setNotifTitle(e.target.value)}
                  placeholder="العنوان"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <input
                  type="text"
                  value={notifBody}
                  onChange={e => setNotifBody(e.target.value)}
                  placeholder="النص (اختياري)"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={notifIcon}
                    onChange={e => setNotifIcon(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 outline-none"
                  >
                    <option value="info">ℹ️ معلومة</option>
                    <option value="heart">❤️ تنبيه</option>
                    <option value="clock">⏰ وقت</option>
                    <option value="star">⭐ مميز</option>
                    <option value="alert">⚠️ هام</option>
                  </select>
                  <input
                    type="text"
                    value={notifTarget}
                    onChange={e => setNotifTarget(e.target.value)}
                    placeholder="رقم مشارك (فارغ = للجميع)"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={sendNotification}
                    disabled={notifSending}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-all active:scale-[0.98] whitespace-nowrap"
                  >
                    {notifSending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                    إرسال
                  </button>
                </div>
                {/* Notification preview */}
                {notifTitle.trim() && (
                  <div className="bg-gray-800/50 border border-blue-800/30 rounded-lg p-2.5">
                    <p className="text-[10px] text-gray-500 mb-1.5">معاينة الإشعار:</p>
                    <div className="bg-blue-950/40 border border-blue-700/40 rounded-lg p-3 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-600/30 flex items-center justify-center flex-shrink-0">
                        {notifIcon === "heart" ? <Heart size={16} className="text-blue-300" /> :
                         notifIcon === "clock" ? <Clock size={16} className="text-blue-300" /> :
                         notifIcon === "star" ? <Star size={16} className="text-blue-300" /> :
                         notifIcon === "alert" ? <AlertTriangle size={16} className="text-blue-300" /> :
                         <Bell size={16} className="text-blue-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-blue-200 text-sm font-semibold truncate">{notifTitle.trim()}</p>
                        {notifBody.trim() && <p className="text-blue-400/70 text-xs mt-0.5 line-clamp-2">{notifBody.trim()}</p>}
                        <p className="text-blue-500/50 text-[10px] mt-1">إلى: <span className="text-amber-400 font-semibold">{notifTarget ? `المشارك #${notifTarget}` : "جميع المشاركين"}</span></p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-gray-900 border border-red-900/40 rounded-xl p-4">
              <h3 className="font-semibold text-red-400 flex items-center gap-2 mb-3">
                <AlertCircle size={16} /> منطقة الخطر
              </h3>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={clearTestData}
                  disabled={!!loading}
                  className="bg-amber-900/50 hover:bg-amber-900 border border-amber-700/50 text-amber-300 rounded-lg px-4 py-2 text-sm flex items-center gap-2"
                >
                  <Trash2 size={14} /> مسح بيانات الاختبار (تصنيفات + فيدبك)
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("حذف جميع فحوصات المزاج؟")) return
                    const d = await api("e3-clear-mood-checks")
                    if (d.error) { toast.error(d.error); return }
                    toast.success("تم حذف فحوصات المزاج")
                    fetchMoodChecks()
                  }}
                  className="bg-purple-900/50 hover:bg-purple-900 border border-purple-700/50 text-purple-300 rounded-lg px-4 py-2 text-sm flex items-center gap-2"
                >
                  <Trash2 size={14} /> مسح فحوصات المزاج
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("حذف جميع الإشعارات؟")) return
                    const d = await api("e3-clear-notifications")
                    if (d.error) { toast.error(d.error); return }
                    toast.success("تم حذف الإشعارات")
                    fetchNotifications()
                  }}
                  className="bg-blue-900/50 hover:bg-blue-900 border border-blue-700/50 text-blue-300 rounded-lg px-4 py-2 text-sm flex items-center gap-2"
                >
                  <Trash2 size={14} /> مسح الإشعارات
                </button>
                <button
                  onClick={resetEvent}
                  disabled={!!loading}
                  className="bg-red-900/50 hover:bg-red-900 border border-red-700/50 text-red-300 rounded-lg px-4 py-2 text-sm flex items-center gap-2"
                >
                  <RotateCcw size={14} /> إعادة تعيين الفعالية بالكامل
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB: SEATING MAP ──────────────────────────────────────────────────── */}
        {activeTab === "seating" && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-sm sm:text-base text-gray-300">خريطة الجلسات التفاعلية</h3>
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
                    {phase3Pairs.length > 0 && (
                      <button onClick={() => setMapRound(30)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${mapRound === 30 ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                      >
                        الخوارزمية
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

            {/* Move mode banner */}
            {moveA !== null && (
              <div className="bg-indigo-900/30 border border-indigo-700/50 rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
                  <span className="text-indigo-300 text-sm font-medium">
                    نقل: <span className="text-white">{participants.find(p => p.number === moveA)?.name}</span>
                    <span className="text-indigo-600 text-xs mr-2">← اضغط على أي طاولة لنقل الشخص إليها</span>
                  </span>
                </div>
                <button onClick={() => setMoveA(null)} className="text-indigo-600 hover:text-indigo-300 text-xs px-2 py-1 rounded-lg hover:bg-indigo-900/30 transition-colors">
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
                {/* Phase 2 Exclusion Controls */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-3">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-300 text-sm flex items-center gap-2">
                      <Shield size={14} className="text-amber-400" />
                      استبعاد من جولة الاختيار
                    </h4>
                    <p className="text-[10px] text-gray-600">استبعد مشاركاً من المطابقة الاختيارية مع إبقائه في باقي الفعالية</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {participants.filter(p => p.selected).map((p: any) => (
                      <button
                        key={p.number}
                        onClick={() => togglePhase2Exclusion(p.number)}
                        disabled={!!loading && loading !== `phase2-exclude-${p.number}`}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 disabled:opacity-40 ${
                          p.phase2_excluded
                            ? 'bg-red-900/40 border-red-700/50 text-red-300'
                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        {loading === `phase2-exclude-${p.number}` ? (
                          <RefreshCw size={10} className="animate-spin" />
                        ) : p.phase2_excluded ? (
                          <Ban size={10} />
                        ) : (
                          <Check size={10} className="text-green-400" />
                        )}
                        <span>{p.name}</span>
                        <span className="text-[9px] opacity-60">#{p.number}</span>
                      </button>
                    ))}
                  </div>
                </div>

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
                              onClick={() => setPairDetail({ type: 'match', ...pair })}
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
                    const hasMoveMember = moveA !== null && members.some(m => m.number === moveA)
                    return (
                      <div key={table}
                        onClick={() => moveA && handleTableClick(table)}
                        className={`bg-gray-900 rounded-2xl p-4 border transition-all duration-200 ${
                        hasSwapMember ? 'border-amber-600/70 shadow-lg shadow-amber-900/20' :
                        swapA !== null ? 'border-blue-800/50 hover:border-blue-600/60' :
                        hasMoveMember ? 'border-indigo-600/70 shadow-lg shadow-indigo-900/20' :
                        moveA !== null ? 'border-indigo-800/50 hover:border-indigo-600/60 cursor-pointer hover:bg-indigo-950/20' :
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
                            const isMoveSrc = moveA === m.number
                            const isViewing = selectedParticipantNum === m.number && participantPanelOpen
                            return (
                              <div key={m.number} className="flex items-center gap-1">
                                <button onClick={() => handleMemberClick(m)}
                                  className={`flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-right transition-all ${
                                    isSwapSrc
                                      ? 'bg-amber-900/40 border border-amber-600/50 text-amber-200 shadow-inner'
                                      : isMoveSrc
                                      ? 'bg-indigo-900/40 border border-indigo-600/50 text-indigo-200 shadow-inner'
                                      : isViewing
                                      ? 'bg-purple-900/30 border border-purple-600/40 text-purple-100'
                                      : swapA !== null
                                      ? 'hover:bg-blue-900/20 border border-transparent hover:border-blue-700/40 text-gray-300 cursor-pointer'
                                      : moveA !== null
                                      ? 'hover:bg-indigo-900/20 border border-transparent hover:border-indigo-700/40 text-gray-300 cursor-pointer'
                                      : 'hover:bg-gray-800/70 border border-transparent hover:border-gray-700/50 text-gray-300 active:scale-[0.98]'
                                  }`}
                                >
                                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${m.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                                  <span className="flex-1 text-sm font-medium truncate text-right">{m.name}</span>
                                  <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">#{m.number}{m.age ? ` · ${m.age}` : ""}</span>
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rankData?.submitted ? 'bg-green-500' : 'bg-gray-700'}`} title={rankData?.submitted ? 'صوّت' : 'لم يصوّت'} />
                                </button>
                                {!swapA && !moveA && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setMoveA(m.number) }}
                                    className="p-1.5 rounded-lg hover:bg-indigo-900/30 text-indigo-500 hover:text-indigo-300 transition-colors flex-shrink-0"
                                    title="نقل إلى طاولة أخرى"
                                  >
                                    <ArrowLeft size={12} />
                                  </button>
                                )}
                              </div>
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
        {activeTab === "participants" && (() => {
          const selected = participants.filter(p => p.selected)
          const getMatchFor = (num: number) => matchPairs.find((mp: any) => mp.aNumber === num || mp.bNumber === num)
          const getPopularity = (num: number) => {
            let count = 0
            for (const r of allRankings) {
              if (r.number === num) continue
              const ranked = r.ranked_list?.find((item: any) => item.number === num)
              if (ranked && ranked.rank <= 3) count++
            }
            return count
          }
          const sortedPts = [...selected].sort((a, b) => {
            if (participantSort === "name") return (a.name || '').localeCompare(b.name || '')
            if (participantSort === "voted") {
              const av = allRankings.find(r => r.number === a.number)?.submitted ? 1 : 0
              const bv = allRankings.find(r => r.number === b.number)?.submitted ? 1 : 0
              return bv - av
            }
            return a.number - b.number
          })
          return (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-semibold text-gray-300">نظرة شاملة على المشاركين</h3>
                <p className="text-xs text-gray-600 mt-0.5">{selected.length} مشارك مختار · اضغط لعرض التفاصيل</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={participantSort}
                  onChange={e => setParticipantSort(e.target.value as any)}
                  className="bg-gray-800 border border-gray-700 text-white rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="number">ترتيب بالرقم</option>
                  <option value="name">ترتيب بالاسم</option>
                  <option value="voted">الذين صوّتوا أولاً</option>
                </select>
                <button onClick={() => { fetchParticipants(); fetchSeating(); fetchRankStatus(); fetchMatches() }} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {selected.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                <p>لم يُختَر مشاركون بعد</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sortedPts.map(p => {
                  const tables = getParticipantTables(p.number)
                  const rankData = allRankings.find(r => r.number === p.number)
                  const match = getMatchFor(p.number)
                  const matchName = match ? (match.aNumber === p.number ? match.bName : match.aName) : null
                  const matchScore = match?.compatibilityScore
                  const matchType = match?.matchType
                  const popularity = getPopularity(p.number)
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
                            {p.attachment_style && (
                              <span className="flex items-center gap-1 text-[10px] text-teal-400">
                                <span className={`w-1.5 h-1.5 rounded-full ${p.attachment_style === 'Secure' ? 'bg-emerald-400' : p.attachment_style === 'Anxious' ? 'bg-yellow-400' : p.attachment_style === 'Avoidant' ? 'bg-red-400' : 'bg-gray-600'}`} />
                                {p.attachment_style === 'Secure' ? 'آمن' : p.attachment_style === 'Anxious' ? 'قلق' : p.attachment_style === 'Avoidant' ? 'تجنّبي' : p.attachment_style}
                              </span>
                            )}
                            {popularity > 0 && <span className="text-[10px] text-pink-400">♥ {popularity}</span>}
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-1">
                          {rankData?.submitted
                            ? <span className="text-[10px] bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full border border-green-800/30">✓ صوّت</span>
                            : <span className="text-[10px] text-gray-700">—</span>
                          }
                          {match && (
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-lg border ${
                              matchScore >= 80 ? 'text-emerald-300 bg-emerald-900/30 border-emerald-800/40' :
                              matchScore >= 68 ? 'text-indigo-300 bg-indigo-900/30 border-indigo-800/40' :
                              'text-yellow-300 bg-yellow-900/20 border-yellow-800/30'
                            }`}>{matchScore}%</span>
                          )}
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
                        {match && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-lg border ${
                            matchType === 'mutual' ? 'bg-emerald-900/20 border-emerald-800/30 text-emerald-400' : 'bg-amber-900/20 border-amber-800/30 text-amber-400'
                          }`}>
                            {matchType === 'mutual' ? '🔁 ' : '⚡ '}{matchName}
                          </span>
                        )}
                        {!tables[1] && !tables[2] && !match && (
                          <span className="text-[10px] text-gray-700">بدون طاولة محددة</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          )
        })()}

        {/* TAB: RANKING ─────────────────────────────────────────────────────── */}
        {activeTab === "ranking" && (() => {
          const filteredRankings = allRankings.filter((r: any) => {
            if (rankSearch) {
              const q = rankSearch.toLowerCase()
              if (!r.name?.toLowerCase().includes(q) && !String(r.number).includes(q)) return false
            }
            if (rankFilter === 'submitted' && !r.submitted) return false
            if (rankFilter === 'pending' && r.submitted) return false
            return true
          })
          const submittedCount = allRankings.filter((r: any) => r.submitted).length
          const pendingCount = allRankings.length - submittedCount
          const autoSavedCount = (rankStatus?.auto_saved_count as number) || 0
          let mutualCount = 0
          const popularityMap: Record<number, number> = {}
          for (const r of allRankings) {
            if (r.ranked_list) {
              for (const item of r.ranked_list) {
                popularityMap[item.number] = (popularityMap[item.number] || 0) + 1
                const theyRankedMe = allRankings.find((x: any) => x.number === item.number)?.ranked_list?.find((y: any) => y.number === r.number)
                if (theyRankedMe && theyRankedMe.rank <= 3 && item.rank <= 3) mutualCount++
              }
            }
          }
          const topPopular = Object.entries(popularityMap).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3)
          const rankBadge = (idx: number) => {
            if (idx === 0) return "bg-gradient-to-br from-yellow-500 to-amber-600 text-amber-950"
            if (idx === 1) return "bg-gradient-to-br from-gray-300 to-gray-400 text-gray-800"
            if (idx === 2) return "bg-gradient-to-br from-orange-600 to-amber-700 text-orange-100"
            return "bg-gray-800 text-gray-500"
          }
          const moveItem = (arr: any[], from: number, to: number) => { const a = [...arr]; const [item] = a.splice(from, 1); a.splice(to, 0, item); return a }
          return (
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
                  onClick={() => { if (confirm("حفظ تصنيفات جميع المشاركين الذين لم يصوتوا تلقائياً؟\nسيتم حفظ ترتيب الأشخاص الذين قابلوهم بالترتيب الافتراضي.")) run("force-save", () => api("e3-force-auto-save-rankings").then(d => { if (!d.error) { toast.success(d.message || "تم الحفظ التلقائي"); fetchRankStatus() } return d })) }}
                  disabled={!!loading || pendingCount === 0}
                  className="flex items-center gap-1.5 bg-amber-900/50 hover:bg-amber-800 border border-amber-700/50 text-amber-300 rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  {loading === "force-save" ? <RefreshCw size={12} className="animate-spin" /> : <Clock size={12} />}
                  حفظ تلقائي للجميع
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
                {/* Progress + Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 mb-1">التقدم</p>
                    <p className="text-lg font-black text-white">{submittedCount}<span className="text-gray-600 text-sm font-normal">/{allRankings.length}</span></p>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1.5">
                      <div className="h-full bg-purple-600 transition-all duration-500" style={{ width: `${(submittedCount / (allRankings.length || 1)) * 100}%` }} />
                    </div>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 mb-1">لم يصوّت</p>
                    <p className="text-lg font-black text-yellow-400">{pendingCount}</p>
                    <p className="text-[9px] text-gray-600 mt-1">بانتظار التصنيف</p>
                    {autoSavedCount > 0 && (
                      <p className="text-[9px] text-amber-400 mt-1 flex items-center gap-1">
                        <Clock size={9} className="inline" /> {autoSavedCount} حفظ تلقائي
                      </p>
                    )}
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 mb-1">تبادل متبادل</p>
                    <p className="text-lg font-black text-emerald-400">{mutualCount}</p>
                    <p className="text-[9px] text-gray-600 mt-1">اختيارات متبادلة</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 mb-1">الأكثر اختياراً</p>
                    {topPopular.length > 0 ? (
                      <p className="text-sm font-bold text-pink-400 truncate">{allRankings.find((x: any) => x.number === Number(topPopular[0][0]))?.name || `#${topPopular[0][0]}`}</p>
                    ) : <p className="text-sm text-gray-600">—</p>}
                    <p className="text-[9px] text-gray-600 mt-1">{topPopular.length > 0 ? `${topPopular[0][1]} أصوات` : ''}</p>
                  </div>
                </div>

                {/* Search & Filter */}
                <div className="flex gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[140px]">
                    <Search size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      type="text"
                      placeholder="ابحث بالاسم أو الرقم..."
                      value={rankSearch}
                      onChange={e => setRankSearch(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pr-8 pl-3 py-1.5 text-xs text-right focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <select
                    value={rankFilter}
                    onChange={e => setRankFilter(e.target.value as any)}
                    className="bg-gray-800 border border-gray-700 text-white rounded-lg px-2 py-1.5 text-xs"
                  >
                    <option value="all">الجميع ({allRankings.length})</option>
                    <option value="submitted">صوّت ({submittedCount})</option>
                    <option value="pending">لم يصوّت ({pendingCount})</option>
                  </select>
                </div>

                {/* Ranking Cards */}
                <div className="space-y-2">
                  {filteredRankings.map((r: any) => (
                    <div key={r.number} className={`bg-gray-900 border rounded-xl overflow-hidden transition-all ${
                      r.submitted ? "border-green-800/50" : "border-gray-800"
                    } ${expandedRanker === r.number ? "ring-1 ring-purple-500/30" : ""}`}>
                      <button
                        onClick={() => setExpandedRanker(expandedRanker === r.number ? null : r.number)}
                        className="w-full flex items-center gap-3 p-3 text-right hover:bg-gray-800/40 transition-colors"
                      >
                        {r.submitted
                          ? <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
                          : <Circle size={16} className="text-gray-600 flex-shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-200 truncate">{r.name}</span>
                          <span className="text-gray-600 text-xs mr-2">#{r.number}</span>
                        </div>
                        {r.submitted ? (
                          <>
                            <span className="text-green-400/70 text-[10px] flex-shrink-0 bg-green-900/20 px-2 py-0.5 rounded-full">{r.count} مرتّبين</span>
                            {r.auto_saved && (
                              <span className="text-amber-400/80 text-[10px] flex-shrink-0 bg-amber-900/30 border border-amber-700/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Clock size={9} className="inline" /> حفظ تلقائي
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-yellow-400/70 text-[10px] flex-shrink-0 bg-yellow-900/20 px-2 py-0.5 rounded-full">بانتظار</span>
                        )}
                        <ChevronRight size={14} className={`text-gray-600 transition-transform flex-shrink-0 ${expandedRanker === r.number ? "rotate-90" : ""}`} />
                      </button>

                      {/* Submitted + Expanded */}
                      {expandedRanker === r.number && r.submitted && (
                        <div className="px-3 pb-3 border-t border-gray-800/60 pt-3 space-y-1.5">
                          {editingRanker === r.number ? (
                            <>
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="text-amber-400 text-[11px] font-medium">اسحب لإعادة الترتيب</span>
                                <span className="text-gray-600 text-[10px]">أو استخدم الأسهم</span>
                              </div>
                              {editedOrder.map((item: any, idx: number) => {
                                const theyRankedMe = allRankings.find((x: any) => x.number === item.number)?.ranked_list?.find((y: any) => y.number === r.number)
                                return (
                                  <div
                                    key={item.number}
                                    draggable
                                    onDragStart={() => setDragIdx(idx)}
                                    onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx) }}
                                    onDragEnd={() => {
                                      if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
                                        setEditedOrder(o => moveItem(o, dragIdx, dragOverIdx))
                                      }
                                      setDragIdx(null); setDragOverIdx(null)
                                    }}
                                    className={`flex items-center gap-2 text-xs rounded-lg px-2 py-2 transition-all cursor-grab active:cursor-grabbing ${
                                      dragOverIdx === idx ? "bg-purple-900/40 border border-purple-600/50" : "bg-gray-800/60 border border-transparent"
                                    } ${dragIdx === idx ? "opacity-40" : ""}`}
                                  >
                                    <GripVertical size={12} className="text-gray-600 flex-shrink-0" />
                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold flex-shrink-0 text-[11px] ${rankBadge(idx)}`}>{idx + 1}</span>
                                    <span className="text-gray-200 flex-1 truncate">{item.name} <span className="text-gray-600">#{item.number}</span></span>
                                    {theyRankedMe && <span className="text-purple-400 text-[9px] bg-purple-900/30 px-1.5 py-0.5 rounded-full">رتّبك #{theyRankedMe.rank}</span>}
                                    <div className="flex gap-0.5">
                                      <button onClick={() => setEditedOrder(o => moveItem(o, idx, idx - 1))} disabled={idx === 0} className="w-6 h-6 rounded-md bg-gray-700/60 hover:bg-gray-600 disabled:opacity-20 flex items-center justify-center text-gray-300 text-[10px]">▲</button>
                                      <button onClick={() => setEditedOrder(o => moveItem(o, idx, idx + 1))} disabled={idx === editedOrder.length - 1} className="w-6 h-6 rounded-md bg-gray-700/60 hover:bg-gray-600 disabled:opacity-20 flex items-center justify-center text-gray-300 text-[10px]">▼</button>
                                    </div>
                                  </div>
                                )
                              })}
                              <div className="flex gap-2 pt-2">
                                <button onClick={() => saveRanking(r.number)} disabled={!!loading} className="flex-1 py-2 rounded-lg bg-emerald-700/60 hover:bg-emerald-700 text-emerald-200 text-xs font-bold transition-colors">
                                  {loading === `save-rank-${r.number}` ? <RefreshCw size={12} className="animate-spin mx-auto" /> : '✓ حفظ التغييرات'}
                                </button>
                                <button onClick={() => setEditingRanker(null)} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs font-medium transition-colors">إلغاء</button>
                              </div>
                            </>
                          ) : (
                            <>
                              {r.ranked_list.map((item: any, idx: number) => {
                                const theyRankedMe = allRankings.find((x: any) => x.number === item.number)?.ranked_list?.find((y: any) => y.number === r.number)
                                const mutual = theyRankedMe && theyRankedMe.rank <= 3 && idx < 3
                                return (
                                  <div key={item.number} className={`flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 transition-colors ${
                                    mutual ? 'bg-emerald-900/20 border border-emerald-700/30' : 'border border-transparent'
                                  }`}>
                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold flex-shrink-0 text-[11px] ${rankBadge(idx)}`}>
                                      {idx === 0 ? <Crown size={11} /> : idx + 1}
                                    </span>
                                    <span className="text-gray-300 flex-1 truncate">{item.name} <span className="text-gray-600">#{item.number}</span></span>
                                    {theyRankedMe ? (
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${mutual ? 'bg-emerald-800/50 text-emerald-300' : 'bg-gray-800 text-gray-500'}`}>
                                        {mutual ? '🔁 تبادل' : `رتّبك #${theyRankedMe.rank}`}
                                      </span>
                                    ) : <span className="text-gray-700 text-[9px]">—</span>}
                                  </div>
                                )
                              })}
                              <button onClick={() => { setEditingRanker(r.number); setEditedOrder([...r.ranked_list]) }} className="mt-2 w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-medium transition-colors flex items-center justify-center gap-1.5">
                                <span className="text-sm">✏️</span> تعديل الترتيب
                              </button>
                              <button
                                onClick={() => run(`rand-${r.number}`, () => api("e3-randomize-ranking-single", { participant_number: r.number }).then(d => { if (!d.error) { toast.success(d.message); fetchRankStatus() } return d }))}
                                disabled={!!loading}
                                className="mt-1.5 w-full py-2 rounded-lg bg-violet-900/40 hover:bg-violet-800 border border-violet-700/30 text-violet-300 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                              >
                                {loading === `rand-${r.number}` ? <RefreshCw size={12} className="animate-spin" /> : <Shuffle size={12} />}
                                عشوائي لهذا الشخص
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Not Submitted + Expanded */}
                      {expandedRanker === r.number && !r.submitted && (
                        <div className="px-3 pb-3 border-t border-gray-800/60 pt-3 space-y-1.5">
                          {simulatingRanker === r.number ? (
                            <>
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="text-amber-400 text-[11px] font-medium">🛠️ تصنيف بالنيابة</span>
                                <span className="text-gray-600 text-[10px]">— اسحب للترتيب</span>
                              </div>
                              {simOrder.map((item: any, idx: number) => (
                                <div
                                  key={item.number}
                                  draggable
                                  onDragStart={() => setDragIdx(idx)}
                                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx) }}
                                  onDragEnd={() => {
                                    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
                                      setSimOrder(o => moveItem(o, dragIdx, dragOverIdx))
                                    }
                                    setDragIdx(null); setDragOverIdx(null)
                                  }}
                                  className={`flex items-center gap-2 text-xs rounded-lg px-2 py-2 transition-all cursor-grab active:cursor-grabbing ${
                                    dragOverIdx === idx ? "bg-amber-900/40 border border-amber-600/50" : "bg-gray-800/60 border border-transparent"
                                  } ${dragIdx === idx ? "opacity-40" : ""}`}
                                >
                                  <GripVertical size={12} className="text-gray-600 flex-shrink-0" />
                                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold flex-shrink-0 text-[11px] ${rankBadge(idx)}`}>{idx + 1}</span>
                                  <span className="text-gray-200 flex-1 truncate">{item.name} <span className="text-gray-600">#{item.number}</span></span>
                                  {item.round && <span className="text-gray-600 text-[9px] bg-gray-800 px-1.5 py-0.5 rounded-full">ج{item.round}</span>}
                                  <div className="flex gap-0.5">
                                    <button onClick={() => setSimOrder(o => moveItem(o, idx, idx - 1))} disabled={idx === 0} className="w-6 h-6 rounded-md bg-gray-700/60 hover:bg-gray-600 disabled:opacity-20 flex items-center justify-center text-gray-300 text-[10px]">▲</button>
                                    <button onClick={() => setSimOrder(o => moveItem(o, idx, idx + 1))} disabled={idx === simOrder.length - 1} className="w-6 h-6 rounded-md bg-gray-700/60 hover:bg-gray-600 disabled:opacity-20 flex items-center justify-center text-gray-300 text-[10px]">▼</button>
                                  </div>
                                </div>
                              ))}
                              <div className="flex gap-2 pt-2">
                                <button onClick={() => saveSimulate(r.number)} disabled={!!loading} className="flex-1 py-2 rounded-lg bg-emerald-700/60 hover:bg-emerald-700 text-emerald-200 text-xs font-bold transition-colors">
                                  {loading === `save-sim-${r.number}` ? <RefreshCw size={12} className="animate-spin mx-auto" /> : '✓ حفظ التصنيف'}
                                </button>
                                <button onClick={() => setSimulatingRanker(null)} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs font-medium transition-colors">إلغاء</button>
                              </div>
                            </>
                          ) : (
                            <div className="text-center py-3">
                              <p className="text-gray-500 text-xs mb-2">لم يقدّم تصنيفه بعد</p>
                              <div className="flex gap-2 justify-center">
                                <button onClick={() => startSimulate(r.number)} disabled={simLoading} className="px-4 py-2 rounded-lg bg-amber-900/40 border border-amber-700/30 hover:bg-amber-900/60 text-amber-300 text-xs font-bold transition-colors">
                                  {simLoading ? <RefreshCw size={12} className="animate-spin" /> : '🛠️ تصنيف بالنيابة'}
                                </button>
                                <button
                                  onClick={() => run(`rand-${r.number}`, () => api("e3-randomize-ranking-single", { participant_number: r.number }).then(d => { if (!d.error) { toast.success(d.message); fetchRankStatus() } return d }))}
                                  disabled={!!loading}
                                  className="px-4 py-2 rounded-lg bg-violet-900/40 border border-violet-700/30 hover:bg-violet-800 text-violet-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                                >
                                  {loading === `rand-${r.number}` ? <RefreshCw size={12} className="animate-spin" /> : <Shuffle size={12} />}
                                  عشوائي
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {filteredRankings.length === 0 && (
                    <div className="text-center py-8 text-gray-600 text-sm">لا توجد نتائج مطابقة</div>
                  )}
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

                          {/* Swap buttons */}
                          <div className="flex gap-2 pt-2 border-t border-gray-800/30">
                            <button
                              onClick={() => { setSwapMatch({ phase: "phase2", missingNum: pair.a, missingName: pair.aName }); setSwapReplacement(null) }}
                              className="flex-1 py-1.5 rounded-lg bg-amber-900/30 hover:bg-amber-900/50 border border-amber-800/40 text-amber-300 text-[10px] font-bold transition-colors"
                            >
                              ⇄ استبدال {pair.aName}
                            </button>
                            <button
                              onClick={() => { setSwapMatch({ phase: "phase2", missingNum: pair.b, missingName: pair.bName }); setSwapReplacement(null) }}
                              className="flex-1 py-1.5 rounded-lg bg-amber-900/30 hover:bg-amber-900/50 border border-amber-800/40 text-amber-300 text-[10px] font-bold transition-colors"
                            >
                              ⇄ استبدال {pair.bName}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Phase 3 (Algorithm) Match Results ─────────────────────── */}
            <div className="space-y-3 pt-2 border-t border-gray-800/60">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-300 text-sm">نتائج مطابقة الخوارزمية</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => run("phase3", () => api("e3-trigger-phase3-matching").then(d => { fetchMatches(); fetchState(); return d }))}
                    disabled={!!loading}
                    className="flex items-center gap-1.5 bg-purple-900/40 hover:bg-purple-900/70 border border-purple-800/50 text-purple-300 rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
                  >
                    {loading === "phase3" ? <RefreshCw size={12} className="animate-spin" /> : <Brain size={12} />}
                    تشغيل المطابقة
                  </button>
                  <button onClick={fetchMatches} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400">
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>
              <div className="bg-purple-950/20 border border-purple-800/30 rounded-lg px-3 py-2">
                <p className="text-[10px] text-purple-300/70 flex items-center gap-1.5">
                  <Shield size={10} className="flex-shrink-0" />
                  المطابقة تستخدم الأزواج المثبتة (locked matches) من لوحة التحكم — لا يتم إعادة الحساب
                </p>
              </div>

              {phase3Pairs.length === 0 ? (
                <p className="text-gray-600 text-xs text-center py-4">لا توجد نتائج بعد — اضغط "تشغيل المطابقة"</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <p className="text-gray-500 text-xs">{phase3Pairs.length} زوج</p>
                  </div>
                  {phase3Pairs.map((pair: any, idx: number) => (
                    <div key={idx} className="border border-purple-800/40 bg-purple-950/10 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedPhase3Pair(expandedPhase3Pair === idx ? null : idx)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors text-right"
                      >
                        <span className="text-gray-600 text-[10px] font-mono w-4 flex-shrink-0">{idx + 1}</span>
                        <div className="flex-1 flex items-center gap-1.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pair.aGender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                          <span className="text-sm font-semibold text-white truncate">{pair.aName}</span>
                        </div>
                        {pair.locked && (
                          <span className="text-[9px] text-amber-400 bg-amber-900/30 border border-amber-700/40 px-1.5 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1">
                            <Shield size={8} /> مثبت
                          </span>
                        )}
                        {pair.compatScore != null && (
                          <span className={`text-xs font-bold flex-shrink-0 ${pair.compatScore >= 80 ? 'text-emerald-400' : pair.compatScore >= 68 ? 'text-indigo-400' : 'text-yellow-400'}`}>{pair.compatScore}%</span>
                        )}
                        <div className="flex-1 flex items-center gap-1.5 min-w-0 justify-end">
                          <span className="text-sm font-semibold text-white truncate">{pair.bName}</span>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pair.bGender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                        </div>
                        <ChevronRight size={12} className={`text-gray-600 flex-shrink-0 transition-transform ${expandedPhase3Pair === idx ? 'rotate-90' : ''}`} />
                      </button>
                      {expandedPhase3Pair === idx && (
                        <div className="border-t border-gray-800/40 px-3 py-3 space-y-3 bg-gray-950/50">
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setSwapMatch({ phase: "phase3", missingNum: pair.a, missingName: pair.aName }); setSwapReplacement(null) }}
                              className="flex-1 py-1.5 rounded-lg bg-amber-900/30 hover:bg-amber-900/50 border border-amber-800/40 text-amber-300 text-[10px] font-bold transition-colors"
                            >
                              ⇄ استبدال {pair.aName}
                            </button>
                            <button
                              onClick={() => { setSwapMatch({ phase: "phase3", missingNum: pair.b, missingName: pair.bName }); setSwapReplacement(null) }}
                              className="flex-1 py-1.5 rounded-lg bg-amber-900/30 hover:bg-amber-900/50 border border-amber-800/40 text-amber-300 text-[10px] font-bold transition-colors"
                            >
                              ⇄ استبدال {pair.bName}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      </div>

      {/* ── Participant Detail Panel ─────────────────────────────────────── */}
      {participantPanelOpen && selectedParticipantNum !== null && (() => {
        const p = participants.find(x => x.number === selectedParticipantNum)
        const rankData = allRankings.find(r => r.number === selectedParticipantNum)
        const tables = getParticipantTables(selectedParticipantNum)
        const match = matchPairs.find((mp: any) => mp.aNumber === selectedParticipantNum || mp.bNumber === selectedParticipantNum)
        const matchName = match ? (match.aNumber === selectedParticipantNum ? match.bName : match.aName) : null
        const matchScore = match?.compatibilityScore
        const matchType = match?.matchType
        const whoRankedMe = allRankings
          .filter((r: any) => r.number !== selectedParticipantNum && r.submitted)
          .map((r: any) => {
            const item = r.ranked_list?.find((i: any) => i.number === selectedParticipantNum)
            return item ? { rankerNum: r.number, rankerName: r.name, rank: item.rank } : null
          })
          .filter(Boolean)
          .sort((a: any, b: any) => a.rank - b.rank)
        if (!p) return null
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setParticipantPanelOpen(false)} />
            <div className="fixed top-0 left-0 h-full w-80 bg-gray-900 border-r border-gray-800 z-50 overflow-y-auto shadow-2xl flex flex-col sm:fixed sm:top-0 sm:left-0 sm:h-full sm:w-80 max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:h-[85vh] max-sm:w-full max-sm:rounded-t-2xl max-sm:border-r-0 max-sm:border-t" dir="rtl">
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

                {/* Match Info */}
                {match && (
                  <div className={`rounded-xl p-3.5 space-y-2 ${matchType === 'mutual' ? 'bg-emerald-950/20 border border-emerald-800/40' : 'bg-amber-950/15 border border-amber-800/30'}`}>
                    <h4 className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                      <Heart size={11} /> المطابقة
                    </h4>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${matchType === 'mutual' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-amber-900/50 text-amber-400'}`}>
                          {matchType === 'mutual' ? '🔁 تبادل' : '⚡ احتياطي'}
                        </span>
                        <span className="text-sm font-semibold text-white">{matchName}</span>
                      </div>
                      {matchScore != null && (
                        <span className={`text-lg font-black ${matchScore >= 80 ? 'text-emerald-400' : matchScore >= 68 ? 'text-indigo-400' : 'text-yellow-400'}`}>{matchScore}%</span>
                      )}
                    </div>
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

                {/* Ranking — who they ranked */}
                <div className="bg-gray-800/50 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                      <BarChart3 size={11} /> تصنيفاته
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

                {/* Who ranked them */}
                {whoRankedMe.length > 0 && (
                  <div className="bg-gray-800/50 rounded-xl p-3.5 space-y-2.5">
                    <h4 className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                      <Users size={11} /> من رتّبوه
                    </h4>
                    <div className="space-y-1.5">
                      {whoRankedMe.slice(0, 8).map((w: any) => {
                        const iRankedThem = rankData?.ranked_list?.find((i: any) => i.number === w.rankerNum)
                        const mutual = iRankedThem && iRankedThem.rank <= 3 && w.rank <= 3
                        return (
                          <div key={w.rankerNum} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg ${mutual ? 'bg-emerald-900/20 border border-emerald-800/30' : ''}`}>
                            <span className="w-5 h-5 rounded-lg bg-gray-700 text-gray-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{w.rank}</span>
                            <span className="text-gray-300 flex-1 truncate">{w.rankerName}</span>
                            <span className="text-gray-600 text-[10px] flex-shrink-0">#{w.rankerNum}</span>
                            {mutual && <span className="text-emerald-400 text-[10px] flex-shrink-0">🔁 تبادل</span>}
                            {iRankedThem && !mutual && <span className="text-gray-500 text-[10px] flex-shrink-0">رتّبه #{iRankedThem.rank}</span>}
                          </div>
                        )
                      })}
                      {whoRankedMe.length > 8 && (
                        <p className="text-[10px] text-gray-600 text-center pt-0.5">+{whoRankedMe.length - 8} آخرون</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-1 space-y-2">
                  <button
                    onClick={() => { setSurveyModal(p); setParticipantPanelOpen(false) }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700/40 text-purple-300 text-sm font-medium transition-all active:scale-[0.98]"
                  >
                    <Eye size={14} /> عرض الاستبيان الكامل
                  </button>
                  <button
                    onClick={() => { setParticipantPanelOpen(false); setSwapA(p.number); setActiveTab("seating") }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/40 text-amber-300 text-sm font-medium transition-all active:scale-[0.98]"
                  >
                    <Shuffle size={14} /> تبديل مكانه في الطاولات
                  </button>
                  <button
                    onClick={() => { setParticipantPanelOpen(false); setMoveA(p.number); setActiveTab("seating") }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-700/40 text-indigo-300 text-sm font-medium transition-all active:scale-[0.98]"
                  >
                    <ArrowLeft size={14} /> نقل إلى طاولة أخرى
                  </button>
                  <button
                    onClick={() => { setInitiateChatTarget({ number: p.number, name: p.name }); setInitiateChatOpen(true); setParticipantPanelOpen(false) }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-700/40 text-emerald-300 text-sm font-medium transition-all active:scale-[0.98]"
                  >
                    <MessageSquare size={14} /> مراسلة المشارك
                  </button>
                  <button
                    onClick={() => { setReplaceParticipant({ oldNum: p.number, oldName: p.name }); setReplaceWith(null) }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-900/30 hover:bg-red-900/50 border border-red-700/40 text-red-300 text-sm font-medium transition-all active:scale-[0.98]"
                  >
                    <Shuffle size={14} /> استبدال المشارك بالكامل
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* TAB: OVERVIEW ─────────────────────────────────────────── */}
      {activeTab === "overview" && (() => {
        const pts: any[] = overviewData?.participants || []
        const matrix: Record<string, { score: number | null; bothComplete: boolean }> = overviewData?.matrix || {}
        const getEntry = (a: number, b: number) => { const k = a < b ? `${a}-${b}` : `${b}-${a}`; return matrix[k] || null }

        // Helper: get ranking data for a participant
        const getTopPick = (num: number) => { const r = getRankerFn(num); return r?.ranked_list?.[0] || null }
        const getMutualTop3Count = (num: number) => {
          let count = 0
          for (const r of allRankings) {
            if (r.number === num) continue
            const rankedMe = r.ranked_list?.find((item: any) => item.number === num)
            if (rankedMe && rankedMe.rank <= 3) {
              const myRanking = getRankerFn(num)
              const iRankedThem = myRanking?.ranked_list?.find((item: any) => item.number === r.number)
              if (iRankedThem && iRankedThem.rank <= 3) count++
            }
          }
          return count
        }

        // Compute avg compatibility per participant
        const getAvgCompat = (pNum: number, pGender: string) => {
          const opposite = pts.filter(p => p.gender !== pGender && p.number !== pNum)
          const scores = opposite.map(p => getEntry(pNum, p.number)?.score).filter(s => s != null) as number[]
          return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
        }

        // Filter participants
        const filteredPts = pts.filter(p => {
          if (overviewSearch) {
            const q = overviewSearch.toLowerCase()
            if (!p.name?.toLowerCase().includes(q) && !String(p.number).includes(q)) return false
          }
          if (overviewFilter === 'incomplete' && p.complete) return false
          if (overviewFilter === 'notvoted' && p.rankingSubmitted) return false
          if (overviewFilter === 'matched' && !p.matchPartner) return false
          if (overviewFilter === 'unmatched' && p.matchPartner) return false
          return true
        })

        const sorted = [...filteredPts].sort((a, b) => {
          if (a.gender !== b.gender) return a.gender === 'male' ? -1 : 1
          return a.number - b.number
        })
        const males = sorted.filter(p => p.gender === 'male')
        const females = sorted.filter(p => p.gender === 'female')

        const cellStyle = (score: number | null, complete: boolean, isMatch: boolean, isMutual: boolean) => {
          if (!complete || score == null) return { background: 'rgba(17,24,39,0.9)', color: '#374151', outline: 'none' }
          let bg = 'rgba(17,24,39,0.9)', col = '#374151'
          if (score >= 80) { bg = 'rgba(16,185,129,0.25)'; col = '#34d399' }
          else if (score >= 68) { bg = 'rgba(99,102,241,0.22)'; col = '#818cf8' }
          else if (score >= 54) { bg = 'rgba(139,92,246,0.18)'; col = '#c084fc' }
          else if (score >= 40) { bg = 'rgba(234,179,8,0.16)'; col = '#facc15' }
          else { bg = 'rgba(239,68,68,0.14)'; col = '#f87171' }
          let outline = 'none'
          if (isMatch) outline = '2px solid #f59e0b'
          else if (isMutual) outline = '2px solid #ec4899'
          return { background: bg, color: col, outline, outlineOffset: '-2px', zIndex: (isMatch || isMutual) ? 1 : 'auto' }
        }

        const mbtiGroup = mbtiGroupFn

        const attachDot = (a: string) => {
          if (a === 'Secure') return 'bg-emerald-400'
          if (a === 'Anxious') return 'bg-yellow-400'
          if (a === 'Avoidant') return 'bg-red-400'
          return 'bg-gray-600'
        }

        const completeCount = pts.filter(p => p.complete).length
        const votedCount = pts.filter(p => p.rankingSubmitted).length
        const matchedCount = pts.filter(p => p.matchPartner).length
        const avgScores = pts.filter(p => p.matchCompatScore != null).map(p => p.matchCompatScore)
        const avgCompat = avgScores.length ? Math.round(avgScores.reduce((a: number, b: number) => a + b, 0) / avgScores.length) : null
        const currentPhaseIdx = PHASES.findIndex(p => p.id === state?.phase)
        const allMales = pts.filter(p => p.gender === 'male')
        const allFemales = pts.filter(p => p.gender === 'female')
        const totalForBalance = allMales.length + allFemales.length

        if (overviewLoading) return (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 size={36} className="text-purple-400 animate-spin" />
            <p className="text-gray-400 text-sm">جاري حساب التوافق لجميع الأزواج…</p>
            <p className="text-gray-600 text-xs">قد يستغرق هذا دقيقة واحدة</p>
          </div>
        )
        if (!overviewData) return (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Layers size={32} className="text-gray-700" />
            <p className="text-gray-500 text-sm">لا توجد بيانات بعد</p>
            <button onClick={fetchOverview} className="text-sm text-purple-400 hover:text-purple-300 bg-purple-900/20 px-4 py-2 rounded-xl border border-purple-800/30">تحميل</button>
          </div>
        )

        return (
          <div className="space-y-5 pb-10">

            {/* ── Header ── */}
            <div className="flex items-center justify-between pt-1">
              <h2 className="text-base font-bold text-white">نظرة شاملة</h2>
              <button onClick={fetchOverview} className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 bg-gray-800/80 px-2.5 py-1.5 rounded-lg border border-gray-700/60 transition-colors">
                <RefreshCw size={11} /> تحديث
              </button>
            </div>

            {/* ── Progress Timeline ── */}
            {state && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
                  {PHASES.map((phase, idx) => (
                    <div key={phase.id} className="flex items-center gap-1 flex-shrink-0">
                      <div className={`px-2 py-1 rounded-lg text-[9px] sm:text-[10px] font-medium transition-all ${
                        idx === currentPhaseIdx
                          ? "bg-purple-600 text-white"
                          : idx < currentPhaseIdx
                          ? "bg-gray-700 text-green-400"
                          : "bg-gray-800 text-gray-600"
                      }`}>
                        {phase.icon} {phase.label}
                        {idx < currentPhaseIdx && <Check size={8} className="inline mr-1" />}
                      </div>
                      {idx < PHASES.length - 1 && <span className="text-gray-700 text-[8px]">→</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Stats Strip ── */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {[
                { label: 'المشاركون', value: pts.length, color: 'text-white', bg: 'bg-gray-800/80 border-gray-700/50' },
                { label: 'الاستبيان', value: `${completeCount}/${pts.length}`, color: completeCount === pts.length ? 'text-emerald-400' : 'text-yellow-400', bg: 'bg-gray-800/80 border-gray-700/50' },
                { label: 'التصويت', value: `${votedCount}/${pts.length}`, color: votedCount === pts.length ? 'text-emerald-400' : 'text-yellow-400', bg: 'bg-gray-800/80 border-gray-700/50' },
                { label: 'المطابقات', value: `${matchedCount / 2 | 0}`, color: matchedCount > 0 ? 'text-pink-400' : 'text-gray-600', bg: 'bg-gray-800/80 border-gray-700/50' },
                { label: 'متوسط التوافق', value: avgCompat != null ? `${avgCompat}%` : '—', color: avgCompat != null && avgCompat >= 68 ? 'text-emerald-400' : avgCompat != null ? 'text-blue-400' : 'text-gray-600', bg: 'bg-gray-800/80 border-gray-700/50' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border px-2 py-2 text-center ${s.bg}`}>
                  <p className={`text-sm font-black leading-none ${s.color}`}>{s.value}</p>
                  <p className="text-[9px] text-gray-600 mt-1 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>

            {/* ── Gender Balance Bar ── */}
            {totalForBalance > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-gray-500">التوازن بين الجنسين</span>
                  <span className="text-[10px] text-gray-600">{allMales.length}ذ · {allFemales.length}أ</span>
                </div>
                <div className="h-3 rounded-full overflow-hidden flex bg-gray-800">
                  <div className="bg-blue-500/70 h-full transition-all duration-500" style={{ width: `${(allMales.length / totalForBalance) * 100}%` }} />
                  <div className="bg-pink-500/70 h-full transition-all duration-500" style={{ width: `${(allFemales.length / totalForBalance) * 100}%` }} />
                </div>
              </div>
            )}

            {/* ── Search & Filter Bar ── */}
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                placeholder="ابحث بالاسم أو الرقم..."
                value={overviewSearch}
                onChange={e => setOverviewSearch(e.target.value)}
                className="flex-1 min-w-[120px] bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-xs text-right focus:outline-none focus:border-purple-500"
              />
              <select
                value={overviewFilter}
                onChange={e => setOverviewFilter(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-white rounded-lg px-2 py-1.5 text-xs"
              >
                <option value="all">الجميع</option>
                <option value="incomplete">استبيان ناقص</option>
                <option value="notvoted">لم يصوّت</option>
                <option value="matched">مطابَق</option>
                <option value="unmatched">غير مطابَق</option>
              </select>
            </div>

            {/* ── Participant Roster ── */}
            <div className="rounded-2xl border border-gray-800 overflow-hidden bg-gray-900/40">
              <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 flex items-center gap-1.5"><Users size={11} /> قائمة المشاركين</span>
                <div className="flex items-center gap-2 text-[9px] text-gray-600">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />ذكور {allMales.length}</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-pink-400 inline-block" />إناث {allFemales.length}</span>
                </div>
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-800/60 bg-gray-800/30">
                      <th className="text-right px-3 py-2 text-gray-500 font-semibold whitespace-nowrap">الاسم</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-semibold">شخصية</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-semibold">تعلّق</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-semibold">ج١</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-semibold">ج٢</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-semibold">صوّت</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-semibold">متوسط</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-semibold">اختياره</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-semibold">تبادل</th>
                      <th className="text-right px-2 py-2 text-gray-500 font-semibold">المطابقة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((p: any, i: number) => {
                      const isFirstFemale = p.gender === 'female' && (i === 0 || sorted[i - 1].gender === 'male')
                      const mb = mbtiGroup(p.mbti)
                      const rowBg = !p.complete ? 'bg-red-950/10' : p.matchPartner ? 'bg-emerald-950/8' : ''
                      const avgC = getAvgCompat(p.number, p.gender)
                      const topPick = getTopPick(p.number)
                      const mutualCount = getMutualTop3Count(p.number)
                      return (
                        <>
                          {isFirstFemale && (
                            <tr key="divider-f" className="border-t-2 border-pink-900/40">
                              <td colSpan={10} className="px-3 py-1 bg-pink-950/10">
                                <span className="text-[9px] text-pink-600 font-semibold tracking-wider uppercase">إناث</span>
                              </td>
                            </tr>
                          )}
                          {i === 0 && p.gender === 'male' && (
                            <tr key="divider-m">
                              <td colSpan={10} className="px-3 py-1 bg-blue-950/10">
                                <span className="text-[9px] text-blue-600 font-semibold tracking-wider uppercase">ذكور</span>
                              </td>
                            </tr>
                          )}
                          <tr key={p.number} className={`border-b border-gray-800/30 hover:bg-gray-800/20 transition-colors ${rowBg}`}>
                            <td className="px-3 py-2">
                              <button onClick={() => { setSurveyModal(p); setOpenSections(new Set(['personality', 'comm', 'energy', 'humor', 'values', 'intent'])) }} className="flex items-center gap-1.5 min-w-0 group text-right">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                                <span className="text-white font-semibold truncate max-w-[80px] group-hover:text-purple-300 transition-colors underline decoration-dotted underline-offset-2 decoration-gray-600 group-hover:decoration-purple-400">{p.name}</span>
                                <span className="text-gray-700 flex-shrink-0">#{p.number}</span>
                                {!p.complete && <span className="text-red-500 text-[9px] flex-shrink-0">⚠</span>}
                              </button>
                            </td>
                            <td className="text-center px-2 py-2">
                              {mb ? <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${mb.cls}`}>{mb.label}</span> : <span className="text-gray-700">—</span>}
                            </td>
                            <td className="text-center px-2 py-2">
                              {p.attachment
                                ? <span className="flex items-center justify-center gap-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${attachDot(p.attachment)}`} />
                                    <span className="text-gray-400 text-[9px]">{p.attachment === 'Secure' ? 'آمن' : p.attachment === 'Anxious' ? 'قلق' : p.attachment === 'Avoidant' ? 'تجنّبي' : p.attachment}</span>
                                  </span>
                                : <span className="text-gray-700">—</span>}
                            </td>
                            <td className="text-center px-2 py-2">
                              {p.r1Table != null ? <span className="text-indigo-300 font-bold">{p.r1Table}</span> : <span className="text-gray-700">—</span>}
                            </td>
                            <td className="text-center px-2 py-2">
                              {p.r2Table != null ? <span className="text-indigo-300 font-bold">{p.r2Table}</span> : <span className="text-gray-700">—</span>}
                            </td>
                            <td className="text-center px-2 py-2">
                              {p.rankingSubmitted
                                ? <span className="text-emerald-400 font-bold text-xs">✓{p.rankingCount}</span>
                                : <span className="text-gray-700 text-xs">✗</span>}
                            </td>
                            <td className="text-center px-2 py-2">
                              {avgC != null ? (
                                <span className={`font-bold text-[10px] ${avgC >= 68 ? 'text-emerald-400' : avgC >= 54 ? 'text-violet-400' : 'text-gray-500'}`}>{avgC}%</span>
                              ) : <span className="text-gray-700">—</span>}
                            </td>
                            <td className="text-center px-2 py-2">
                              {topPick ? (
                                <span className="text-gray-400 text-[10px] truncate max-w-[60px] inline-block">{topPick.name}</span>
                              ) : <span className="text-gray-700">—</span>}
                            </td>
                            <td className="text-center px-2 py-2">
                              {mutualCount > 0 ? (
                                <span className="text-pink-400 font-bold text-[10px]">🔁{mutualCount}</span>
                              ) : <span className="text-gray-700">—</span>}
                            </td>
                            <td className="px-2 py-2 text-right">
                              {p.matchPartner ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span className="text-gray-300 truncate max-w-[70px] text-[11px]">{p.matchPartnerName || `#${p.matchPartner}`}</span>
                                  {p.matchCompatScore != null && (
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-lg border ${
                                      p.matchCompatScore >= 80 ? 'text-emerald-300 bg-emerald-900/30 border-emerald-800/40' :
                                      p.matchCompatScore >= 68 ? 'text-indigo-300 bg-indigo-900/30 border-indigo-800/40' :
                                      p.matchCompatScore >= 54 ? 'text-violet-300 bg-violet-900/30 border-violet-800/40' :
                                      'text-yellow-300 bg-yellow-900/20 border-yellow-800/30'
                                    }`}>{p.matchCompatScore}%</span>
                                  )}
                                </div>
                              ) : <span className="text-gray-700 text-[10px]">لا يوجد</span>}
                            </td>
                          </tr>
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile: card layout */}
              <div className="sm:hidden divide-y divide-gray-800/40">
                {sorted.map((p: any) => {
                  const mb = mbtiGroup(p.mbti)
                  const avgC = getAvgCompat(p.number, p.gender)
                  const topPick = getTopPick(p.number)
                  const mutualCount = getMutualTop3Count(p.number)
                  return (
                    <div key={p.number} className={`p-3 ${!p.complete ? 'bg-red-950/10' : p.matchPartner ? 'bg-emerald-950/8' : ''}`}>
                      <div className="flex items-center justify-between mb-2">
                        <button onClick={() => { setSurveyModal(p); setOpenSections(new Set(['personality', 'comm', 'energy', 'humor', 'values', 'intent'])) }} className="flex items-center gap-1.5 min-w-0 group text-right">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                          <span className="text-white font-semibold text-xs truncate max-w-[100px] underline decoration-dotted underline-offset-2 decoration-gray-600">{p.name}</span>
                          <span className="text-gray-700 text-[10px]">#{p.number}</span>
                          {!p.complete && <span className="text-red-500 text-[9px]">⚠</span>}
                        </button>
                        {p.matchPartner && (
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-lg border ${
                            p.matchCompatScore >= 80 ? 'text-emerald-300 bg-emerald-900/30 border-emerald-800/40' :
                            p.matchCompatScore >= 68 ? 'text-indigo-300 bg-indigo-900/30 border-indigo-800/40' :
                            'text-yellow-300 bg-yellow-900/20 border-yellow-800/30'
                          }`}>{p.matchCompatScore}%</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-[9px]">
                        {mb && <span className={`font-bold px-1.5 py-0.5 rounded border ${mb.cls}`}>{mb.label}</span>}
                        {p.attachment && (
                          <span className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${attachDot(p.attachment)}`} />
                            <span className="text-gray-400">{p.attachment === 'Secure' ? 'آمن' : p.attachment === 'Anxious' ? 'قلق' : 'تجنّبي'}</span>
                          </span>
                        )}
                        {p.r1Table != null && <span className="text-indigo-300">ج١: {p.r1Table}</span>}
                        {p.r2Table != null && <span className="text-indigo-300">ج٢: {p.r2Table}</span>}
                        {p.rankingSubmitted
                          ? <span className="text-emerald-400">✓ صوّت ({p.rankingCount})</span>
                          : <span className="text-gray-600">✗ لم يصوّت</span>}
                        {avgC != null && <span className={avgC >= 68 ? 'text-emerald-400' : 'text-gray-500'}>متوسط: {avgC}%</span>}
                        {topPick && <span className="text-gray-500">اختياره: {topPick.name}</span>}
                        {mutualCount > 0 && <span className="text-pink-400">🔁 تبادل {mutualCount}</span>}
                        {p.matchPartner && <span className="text-gray-400">المطابقة: {p.matchPartnerName || `#${p.matchPartner}`}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Compatibility Matrix ── */}
            {males.length > 0 && females.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                  <span className="text-xs font-semibold text-gray-400 flex items-center gap-1.5"><Heart size={11} /> مصفوفة التوافق</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] text-amber-500 flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border-2 border-amber-500/70" />مطابقة</span>
                    <span className="text-[9px] text-pink-500 flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border-2 border-pink-500/70" />تبادل ذوياً</span>
                    <span className="text-[9px] text-gray-600">ذكور × إناث</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-800 overflow-auto bg-gray-900/40">
                  <table className="text-[11px] border-collapse">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-20 bg-gray-900 px-3 py-2.5 text-gray-600 font-semibold text-right min-w-[90px] border-b border-r border-gray-800">
                          ذ ╲ أ
                        </th>
                        {females.map((f: any) => (
                          <th key={f.number} className="bg-gray-900/80 px-1.5 py-2 border-b border-gray-800 min-w-[56px]">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-pink-300 font-semibold text-[10px] truncate max-w-[50px]">{f.name.split(' ')[0]}</span>
                              <span className="text-gray-600 text-[8px]">#{f.number}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {males.map((m: any, mi: number) => (
                        <tr key={m.number} className={mi < males.length - 1 ? 'border-b border-gray-800/40' : ''}>
                          <td className="sticky left-0 z-10 bg-gray-900 px-3 py-2 border-r border-gray-800">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-blue-300 font-semibold text-[10px] truncate max-w-[78px]">{m.name.split(' ')[0]}</span>
                              <span className="text-gray-600 text-[8px]">#{m.number}</span>
                            </div>
                          </td>
                          {females.map((f: any) => {
                            const entry = getEntry(m.number, f.number)
                            const isMatch = !!(m.matchPartner === f.number || f.matchPartner === m.number)
                            const isMutual = isMutualTop3Fn(m.number, f.number)
                            const st = cellStyle(entry?.score ?? null, entry?.bothComplete ?? false, isMatch, isMutual)
                            return (
                              <td
                                key={f.number}
                                style={{ background: st.background, color: st.color, outline: st.outline, outlineOffset: st.outlineOffset, position: 'relative' } as any}
                                className="text-center px-1 py-2 transition-colors hover:brightness-125 cursor-pointer"
                                onClick={() => setPairDetail({ type: 'overview', a: m, b: f, score: entry?.score ?? null })}
                              >
                                {entry?.score != null
                                  ? <span className="font-black text-[13px]">{entry.score}</span>
                                  : <span className="text-[9px]">?</span>
                                }
                                {isMatch && <span className="absolute top-0.5 right-0.5 text-[7px] text-amber-500">★</span>}
                                {isMutual && !isMatch && <span className="absolute top-0.5 right-0.5 text-[7px] text-pink-500">♥</span>}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Compact legend */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {[
                    { s: 'rgba(16,185,129,0.25)', c: '#34d399', l: '≥80' },
                    { s: 'rgba(99,102,241,0.22)', c: '#818cf8', l: '68–79' },
                    { s: 'rgba(139,92,246,0.18)', c: '#c084fc', l: '54–67' },
                    { s: 'rgba(234,179,8,0.16)',  c: '#facc15', l: '40–53' },
                    { s: 'rgba(239,68,68,0.14)',  c: '#f87171', l: '<40'   },
                  ].map(l => (
                    <div key={l.l} className="flex items-center gap-1">
                      <div style={{ background: l.s }} className="w-4 h-3 rounded-sm border border-white/5" />
                      <span style={{ color: l.c }} className="text-[9px] font-bold">{l.l}</span>
                    </div>
                  ))}
                  <span className="text-[9px] text-gray-700 mr-1">· ★ = مطابقة · ♥ = تبادل ذوياً</span>
                </div>
              </div>
            )}

          </div>
        )
      })()}

      {/* ── Pair Detail Modal ───────────────────────────────── */}
      {pairDetail?.type === 'overview' && (() => {
        const { a, b, score } = pairDetail
        const aMb = mbtiGroupFn(a.mbti)
        const bMb = mbtiGroupFn(b.mbti)
        const mutual = isMutualTop3Fn(a.number, b.number)
        const aRankOfB = allRankings.find((r: any) => r.number === a.number)?.ranked_list?.find((item: any) => item.number === b.number)
        const bRankOfA = allRankings.find((r: any) => r.number === b.number)?.ranked_list?.find((item: any) => item.number === a.number)
        return (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPairDetail(null)}>
            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-sm p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">تفاصيل الزوج</h3>
                <button onClick={() => setPairDetail(null)} className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white">
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-900 rounded-xl p-3 text-center">
                  <div className={`w-8 h-8 rounded-full ${a.gender === 'female' ? 'bg-pink-900/40' : 'bg-blue-900/40'} flex items-center justify-center text-sm font-bold mx-auto mb-2 ${a.gender === 'female' ? 'text-pink-300' : 'text-blue-300'}`}>{a.name?.charAt(0)}</div>
                  <p className="text-white text-xs font-semibold">{a.name}</p>
                  <p className="text-gray-600 text-[10px]">#{a.number}</p>
                  {aMb && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border mt-1 inline-block ${aMb.cls}`}>{aMb.label}</span>}
                  <p className="text-gray-500 text-[10px] mt-1">{a.attachment === 'Secure' ? 'تعلّق آمن' : a.attachment === 'Anxious' ? 'تعلّق قلق' : a.attachment === 'Avoidant' ? 'تعلّق تجنّبي' : a.attachment || '—'}</p>
                </div>
                <div className="bg-gray-900 rounded-xl p-3 text-center">
                  <div className={`w-8 h-8 rounded-full ${b.gender === 'female' ? 'bg-pink-900/40' : 'bg-blue-900/40'} flex items-center justify-center text-sm font-bold mx-auto mb-2 ${b.gender === 'female' ? 'text-pink-300' : 'text-blue-300'}`}>{b.name?.charAt(0)}</div>
                  <p className="text-white text-xs font-semibold">{b.name}</p>
                  <p className="text-gray-600 text-[10px]">#{b.number}</p>
                  {bMb && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border mt-1 inline-block ${bMb.cls}`}>{bMb.label}</span>}
                  <p className="text-gray-500 text-[10px] mt-1">{b.attachment === 'Secure' ? 'تعلّق آمن' : b.attachment === 'Anxious' ? 'تعلّق قلق' : b.attachment === 'Avoidant' ? 'تعلّق تجنّبي' : b.attachment || '—'}</p>
                </div>
              </div>
              <div className="space-y-2">
                {score != null ? (
                  <div className="bg-gray-900 rounded-xl p-3 text-center">
                    <p className="text-gray-500 text-[10px] mb-1">نسبة التوافق</p>
                    <p className={`text-3xl font-black ${score >= 80 ? 'text-emerald-400' : score >= 68 ? 'text-indigo-400' : score >= 54 ? 'text-violet-400' : score >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{score}%</p>
                  </div>
                ) : (
                  <div className="bg-gray-900 rounded-xl p-3 text-center">
                    <p className="text-gray-600 text-xs">لم يكتمل الاستبيان بعد</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-900 rounded-lg p-2 text-center">
                    <p className="text-gray-600 text-[9px]">{a.name?.split(' ')[0]} رتّب {b.name?.split(' ')[0]}</p>
                    {aRankOfB ? <p className="text-purple-400 font-bold text-sm">#{aRankOfB.rank}</p> : <p className="text-gray-700 text-[10px]">لم يرتّب</p>}
                  </div>
                  <div className="bg-gray-900 rounded-lg p-2 text-center">
                    <p className="text-gray-600 text-[9px]">{b.name?.split(' ')[0]} رتّب {a.name?.split(' ')[0]}</p>
                    {bRankOfA ? <p className="text-purple-400 font-bold text-sm">#{bRankOfA.rank}</p> : <p className="text-gray-700 text-[10px]">لم يرتّب</p>}
                  </div>
                </div>
                {mutual && (
                  <div className="bg-pink-950/20 border border-pink-800/30 rounded-lg p-2 text-center">
                    <p className="text-pink-400 text-xs font-semibold">♥ تبادل ذوياً — كلاهما اختار الآخر في أول ٣</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Survey Detail Modal ───────────────────────────────── */}
      {surveyModal && (() => {
        const p = surveyModal
        const s = p.surveyAnswers || {}
        const isFemale = p.gender === 'female'

        const mbtiGroup = (m: string) => {
          if (!m) return null
          const t = m.toUpperCase()
          if (['INFJ','INFP','ENFJ','ENFP'].includes(t)) return { name: 'Idealist (NF)', ar: 'مثالي', note: 'عمق عاطفي، معاني وروابط', col: 'text-violet-300' }
          if (['INTJ','INTP','ENTJ','ENTP'].includes(t)) return { name: 'Analyst (NT)', ar: 'محلل', note: 'منطق، استراتيجية، أفكار', col: 'text-blue-300' }
          if (['ISFJ','ISTJ','ESFJ','ESTJ'].includes(t)) return { name: 'Guardian (SJ)', ar: 'حارس', note: 'استقرار، تقاليد، موثوقية', col: 'text-teal-300' }
          return { name: 'Artisan (SP)', ar: 'فنان', note: 'عفوية، حاضر، مغامرة', col: 'text-amber-300' }
        }
        const firstLetter = s.mbti?.[0]?.toUpperCase()
        const ieNote = firstLetter === 'I' ? { label: 'انطوائي', note: 'I+I = 0 نقاط، I+E = 2.5 نقاط', col: 'text-indigo-300' }
          : firstLetter === 'E' ? { label: 'انبساطي', note: 'E+E = 2.5 نقاط، E+I = 2.5 نقاط', col: 'text-orange-300' } : null

        const lifestyle = s.lifestyle ? s.lifestyle.split(',') : []
        const coreVals = s.core_values ? s.core_values.split(',') : []

        const lifestyleLabels = [
          { q: 'وقت النشاط', opts: { 'أ': 'الصباح', 'ب': 'بعد الظهر', 'ج': 'المساء/الليل' } },
          { q: 'تواتر التواصل', opts: { 'أ': 'يومياً', 'ب': 'كل أيام', 'ج': 'نادراً' } },
          { q: 'المساحة الشخصية', opts: { 'أ': 'يحتاج مساحة كبيرة', 'ب': 'متوسط', 'ج': 'يفضل القرب' } },
          { q: 'أسلوب التخطيط', opts: { 'أ': 'منظم تماماً', 'ب': 'شبه منظم', 'ج': 'عفوي' } },
          { q: 'العطلة المثالية', opts: { 'أ': 'نشاطات اجتماعية', 'ب': 'هادئ مع أصدقاء قليلين', 'ج': 'في المنزل' } },
        ]
        const coreValLabels = [
          { q: 'الطموح', opts: { 'أ': 'الطموح أولاً', 'ب': 'توازن', 'ج': 'الاستقرار أولاً' } },
          { q: 'الدين والروحانية', opts: { 'أ': 'محوري في حياتي', 'ب': 'مهم لكن مرن', 'ج': 'شخصي وخاص' } },
          { q: 'الأسرة والعلاقات', opts: { 'أ': 'أولوية قصوى', 'ب': 'مهم مع استقلالية', 'ج': 'أُقدّر حريتي أكثر' } },
          { q: 'الصدق والشفافية', opts: { 'أ': 'صريح تماماً دائماً', 'ب': 'صادق مع حساسية', 'ج': 'أتحاشى المواجهة' } },
          { q: 'النمو الشخصي', opts: { 'أ': 'أسعى له باستمرار', 'ب': 'مهم لكن ليس هوساً', 'ج': 'أتقبّل نفسي كما أنا' } },
        ]

        const Row = ({ icon, label, value, badge, impact, impactColor = 'text-gray-500' }: any) => (
          <div className="flex items-start gap-3 py-2.5 border-b border-gray-800/40 last:border-0">
            <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-400 text-[11px]">{label}</span>
                {badge && <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>}
                {value && !badge && <span className="text-white font-bold text-xs">{value}</span>}
              </div>
              {impact && <p className={`text-[10px] mt-0.5 leading-tight ${impactColor}`}>{impact}</p>}
            </div>
          </div>
        )

        const Section = ({ id, icon, title, pts, children, open, onToggle }: any) => (
          <div className="border-b border-gray-800/50 last:border-0">
            <button onClick={() => onToggle(id)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-sm">{icon}</span>
                <span className="text-xs font-semibold text-gray-200">{title}</span>
                {pts && <span className="text-[9px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded-full">{pts}</span>}
              </div>
              <ChevronDown size={13} className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && <div className="px-4 pb-3">{children}</div>}
          </div>
        )

        const toggleSection = (id: string) => setOpenSections(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

        const mbg = mbtiGroup(s.mbti || '')

        const answerBadge = (val: string | null, map: Record<string, { label: string; cls: string }>) => {
          if (!val) return null
          return map[val.toUpperCase()] || { label: val, cls: 'text-gray-300 bg-gray-800 border-gray-700' }
        }

        const roleBadge = answerBadge(s.conversational_role, {
          A: { label: 'A · مبادر', cls: 'text-orange-300 bg-orange-900/30 border-orange-700/40' },
          B: { label: 'B · مستجيب', cls: 'text-blue-300 bg-blue-900/30 border-blue-700/40' },
          C: { label: 'C · مستمع', cls: 'text-gray-300 bg-gray-800 border-gray-700' },
        })
        const depthBadge = answerBadge(s.conversation_depth, {
          A: { label: 'A · عميق', cls: 'text-violet-300 bg-violet-900/30 border-violet-700/40' },
          B: { label: 'B · متوسط', cls: 'text-blue-300 bg-blue-900/30 border-blue-700/40' },
          C: { label: 'C · خفيف', cls: 'text-teal-300 bg-teal-900/30 border-teal-700/40' },
        })
        const batteryBadge = answerBadge(s.social_battery, {
          A: { label: 'A · انبساطي', cls: 'text-amber-300 bg-amber-900/30 border-amber-700/40' },
          B: { label: 'B · متوسط', cls: 'text-blue-300 bg-blue-900/30 border-blue-700/40' },
          C: { label: 'C · انطوائي', cls: 'text-indigo-300 bg-indigo-900/30 border-indigo-700/40' },
        })
        const humorBanterBadge = answerBadge(s.humor_banter, {
          A: { label: 'A · مرح وخفيف', cls: 'text-yellow-300 bg-yellow-900/30 border-yellow-700/40' },
          B: { label: 'B · دافئ وودود', cls: 'text-pink-300 bg-pink-900/30 border-pink-700/40' },
          C: { label: 'C · هادئ وطبيعي', cls: 'text-teal-300 bg-teal-900/30 border-teal-700/40' },
          D: { label: 'D · جدي نسبياً', cls: 'text-gray-300 bg-gray-800 border-gray-700' },
        })
        const humorSubBadge = answerBadge(s.humor_subtype, {
          A: { label: 'A · سخرية', cls: 'text-red-300 bg-red-900/30 border-red-700/40' },
          B: { label: 'B · قصص ممتعة', cls: 'text-blue-300 bg-blue-900/30 border-blue-700/40' },
          C: { label: 'C · عفوي', cls: 'text-green-300 bg-green-900/30 border-green-700/40' },
          D: { label: 'D · هادئ', cls: 'text-gray-300 bg-gray-800 border-gray-700' },
        })
        const curiosityBadge = answerBadge(s.curiosity_style, {
          A: { label: 'A · فكري', cls: 'text-violet-300 bg-violet-900/30 border-violet-700/40' },
          B: { label: 'B · عملي', cls: 'text-amber-300 bg-amber-900/30 border-amber-700/40' },
          C: { label: 'C · عاطفي', cls: 'text-pink-300 bg-pink-900/30 border-pink-700/40' },
        })
        const silenceBadge = answerBadge(s.silence_comfort, {
          A: { label: 'A · مرتاح مع الصمت', cls: 'text-teal-300 bg-teal-900/30 border-teal-700/40' },
          B: { label: 'B · غير مرتاح', cls: 'text-orange-300 bg-orange-900/30 border-orange-700/40' },
        })
        const intentBadge = answerBadge(s.intent_goal, {
          A: { label: 'A · توسيع الدائرة', cls: 'text-blue-300 bg-blue-900/30 border-blue-700/40' },
          B: { label: 'B · تواصل فكري', cls: 'text-violet-300 bg-violet-900/30 border-violet-700/40' },
          C: { label: 'C · استكشاف', cls: 'text-emerald-300 bg-emerald-900/30 border-emerald-700/40' },
        })
        const commBadge = answerBadge(s.communication, {
          ASSERTIVE: { label: 'حازم', cls: 'text-emerald-300 bg-emerald-900/30 border-emerald-700/40' },
          PASSIVE: { label: 'سلبي', cls: 'text-blue-300 bg-blue-900/30 border-blue-700/40' },
          'PASSIVE-AGGRESSIVE': { label: 'سلبي-عدواني', cls: 'text-amber-300 bg-amber-900/30 border-amber-700/40' },
          AGGRESSIVE: { label: 'عدواني', cls: 'text-red-300 bg-red-900/30 border-red-700/40' },
        })
        const attachBadge = answerBadge(s.attachment, {
          SECURE: { label: 'آمن ✓', cls: 'text-emerald-300 bg-emerald-900/30 border-emerald-700/40' },
          ANXIOUS: { label: 'قلق', cls: 'text-yellow-300 bg-yellow-900/30 border-yellow-700/40' },
          AVOIDANT: { label: 'تجنّبي', cls: 'text-red-300 bg-red-900/30 border-red-700/40' },
          FEARFUL: { label: 'خائف', cls: 'text-orange-300 bg-orange-900/30 border-orange-700/40' },
        })
        const openNum = s.early_openness !== null && s.early_openness !== undefined ? Number(s.early_openness) : null

        return (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSurveyModal(null)}>
            <div className="bg-gray-950 border border-gray-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className={`relative px-5 pt-5 pb-4 flex-shrink-0 ${isFemale ? 'bg-gradient-to-b from-pink-950/60 to-gray-950' : 'bg-gradient-to-b from-blue-950/60 to-gray-950'}`}>
                <div className={`absolute top-0 left-0 right-0 h-0.5 ${isFemale ? 'bg-gradient-to-r from-transparent via-pink-500/70 to-transparent' : 'bg-gradient-to-r from-transparent via-blue-500/70 to-transparent'}`} />
                <button onClick={() => setSurveyModal(null)} className="absolute top-4 left-4 text-gray-600 hover:text-gray-300 p-1 rounded-lg hover:bg-gray-800/50">
                  <X size={16} />
                </button>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 ${isFemale ? 'bg-pink-900/40 border border-pink-800/40' : 'bg-blue-900/40 border border-blue-800/40'}`}>
                    {isFemale ? '♀' : '♂'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-bold text-base">{p.name}</h3>
                      <span className="text-gray-600 text-xs">#{p.number}</span>
                      {p.age && <span className="text-gray-500 text-xs">{p.age} سنة</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${p.complete ? 'text-emerald-300 bg-emerald-900/30 border-emerald-700/40' : 'text-red-300 bg-red-900/30 border-red-700/40'}`}>
                        {p.complete ? '✓ استبيان مكتمل' : '⚠ استبيان ناقص'}
                      </span>
                      {s.mbti && <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-200">{s.mbti}</span>}
                      {s.gender_preference && <span className="text-[9px] text-gray-500 px-1.5 py-0.5 rounded-full bg-gray-800/60">
                        {s.gender_preference === 'opposite_gender' ? 'يفضل الجنس الآخر' : s.gender_preference === 'same_gender' ? 'يفضل نفس الجنس' : 'أي جنس'}
                      </span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1">

                {/* 1. Personality & Attachment */}
                <Section id="personality" icon="🧠" title="الشخصية والتعلّق" pts="MBTI · تعلق" open={openSections.has('personality')} onToggle={toggleSection}>
                  <Row icon="🔠" label="نوع MBTI"
                    badge={s.mbti ? { label: s.mbti, cls: mbg ? `${mbg.col.replace('text-','text-')} bg-gray-800 border-gray-700` : 'text-gray-300 bg-gray-800 border-gray-700' } : null}
                    impact={mbg ? `${mbg.ar} (${mbg.name}) — ${mbg.note}` : 'غير محدد'}
                    impactColor={mbg?.col || 'text-gray-600'} />
                  {ieNote && <Row icon="↔️" label="الطاقة الاجتماعية (I/E)"
                    badge={{ label: ieNote.label, cls: `${ieNote.col} bg-gray-800 border-gray-700` }}
                    impact={ieNote.note} impactColor={ieNote.col} />}
                  <Row icon="🔗" label="أسلوب التعلّق"
                    badge={attachBadge}
                    impact={s.attachment === 'Secure' ? 'آمن: يمنح +5 نقاط مع أي شريك' : s.attachment === 'Anxious' ? 'قلق: إذا كلاهما قلق → عقوبة' : s.attachment === 'Avoidant' ? 'تجنّبي: إذا كلاهما تجنّبي → عقوبة' : 'قيمة افتراضية +2.5 نقطة'}
                    impactColor={s.attachment === 'Secure' ? 'text-emerald-400' : 'text-yellow-500'} />
                </Section>

                {/* 2. Communication */}
                <Section id="comm" icon="💬" title="أسلوب التواصل" pts="حتى 17 نقطة" open={openSections.has('comm')} onToggle={toggleSection}>
                  <Row icon="🗣️" label="طريقة التعبير" badge={commBadge}
                    impact={'Assertive+Assertive = 10 | Assertive+Passive = 8 | Passive+Passive = 5'}
                    impactColor="text-gray-600" />
                  <Row icon="🎙️" label="الدور في الحوار (Q35)" badge={roleBadge}
                    impact={s.conversational_role?.toUpperCase() === 'A' ? 'مبادر: أفضل مع مستجيب/مستمع = 7 نقاط' : s.conversational_role?.toUpperCase() === 'B' ? 'مستجيب: يبني على ما يقوله الآخر = 4-7 نقاط' : s.conversational_role?.toUpperCase() === 'C' ? 'مستمع: اثنان مستمعَين = 0 نقاط' : 'غير محدد'}
                    impactColor={s.conversational_role?.toUpperCase() === 'C' ? 'text-red-400' : 'text-gray-500'} />
                  <Row icon="🌊" label="عمق المحادثة (Q36)" badge={depthBadge}
                    impact="يجب أن يتطابق مع الشريك → +5 نقاط | اختلاف = 0 نقاط"
                    impactColor="text-amber-500" />
                </Section>

                {/* 3. Energy & Openness */}
                <Section id="energy" icon="⚡" title="الطاقة والانفتاح" pts="حتى 9 نقاط" open={openSections.has('energy')} onToggle={toggleSection}>
                  <Row icon="😄" label="أسلوب الدعابة (humor_banter)" badge={humorBanterBadge}
                    impact="يؤثر في مستوى الطاقة الكلية للمشارك (جزء من الحساب)"
                    impactColor="text-gray-500" />
                  <Row icon="🔓" label={`الانفتاح المبكر (0–3) · القيمة: ${openNum !== null ? openNum : '—'}`}
                    badge={openNum !== null ? {
                      label: openNum === 0 ? '0 · منغلق' : openNum === 1 ? '1 · خجول' : openNum === 2 ? '2 · مرن' : '3 · منفتح جداً',
                      cls: openNum === 0 ? 'text-red-300 bg-red-900/30 border-red-700/40' : openNum === 3 ? 'text-green-300 bg-green-900/30 border-green-700/40' : 'text-blue-300 bg-blue-900/30 border-blue-700/40'
                    } : null}
                    impact={openNum === 0 ? '⚠ إذا كلاهما 0 → Dead Air Veto (استبعاد)' : 'يرفع مستوى الطاقة الكلية'}
                    impactColor={openNum === 0 ? 'text-red-400' : 'text-gray-500'} />
                  <Row icon="🔋" label="البطارية الاجتماعية (Q37)" badge={batteryBadge}
                    impact="أي مزيج = +3-4 نقاط. لا عقوبة للاختلاف"
                    impactColor="text-gray-500" />
                </Section>

                {/* 4. Humor & Curiosity */}
                <Section id="humor" icon="😂" title="الفكاهة والفضول والصمت" pts="حتى 14 نقطة" open={openSections.has('humor')} onToggle={toggleSection}>
                  <Row icon="🎭" label="نوع الفكاهة (Q38)" badge={humorSubBadge}
                    impact={`نفس النوع = 4 نقاط · A+C أو B+C = 3 نقاط · غيرها = 2 نقاط`}
                    impactColor="text-gray-500" />
                  <Row icon="🔍" label="أسلوب الفضول (Q39)" badge={curiosityBadge}
                    impact={`A+B (فكري+عملي) = 5 نقاط · C+C (عاطفي+عاطفي) = 5 نقاط · A+A أو B+B = 0 نقاط`}
                    impactColor={s.curiosity_style?.toUpperCase() === 'C' ? 'text-pink-400' : 'text-gray-500'} />
                  <Row icon="🤫" label="الراحة مع الصمت (Q41)" badge={silenceBadge}
                    impact={`A+B (مرتاح+غير مرتاح) = 5 نقاط تكاملية · A+A = 3 · B+B = 3`}
                    impactColor={s.silence_comfort?.toUpperCase() === 'A' ? 'text-teal-400' : 'text-orange-400'} />
                </Section>

                {/* 5. Values & Lifestyle */}
                <Section id="values" icon="🌟" title="القيم وأسلوب الحياة" pts="حتى 30 نقطة" open={openSections.has('values')} onToggle={toggleSection}>
                  {coreVals.length === 5 ? (
                    <div className="space-y-2 mb-3">
                      <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider mb-1">القيم الجوهرية (تطابق = 4 نقاط · مجاور = 2 · مقابل = 0)</p>
                      {coreValLabels.map((cl, i) => {
                        const v = coreVals[i]
                        const label = cl.opts[v as keyof typeof cl.opts] || v
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[9px] text-gray-600 w-[70px] flex-shrink-0 truncate">{cl.q}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${v === 'أ' ? 'text-blue-300 bg-blue-900/20 border-blue-800/40' : v === 'ب' ? 'text-violet-300 bg-violet-900/20 border-violet-800/40' : 'text-teal-300 bg-teal-900/20 border-teal-800/40'}`}>{v}</span>
                            <span className="text-gray-400 text-[9px] truncate">{label}</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : <p className="text-[10px] text-gray-600 mb-2">القيم الجوهرية: غير مكتملة</p>}
                  {lifestyle.length === 5 ? (
                    <div className="space-y-2">
                      <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider mb-1">أسلوب الحياة (تطابق = 3 نقاط · متقارب = 1.5 · بعيد = 0)</p>
                      {lifestyleLabels.map((ll, i) => {
                        const v = lifestyle[i]
                        const label = ll.opts[v as keyof typeof ll.opts] || v
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[9px] text-gray-600 w-[70px] flex-shrink-0 truncate">{ll.q}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${v === 'أ' ? 'text-amber-300 bg-amber-900/20 border-amber-800/40' : v === 'ب' ? 'text-indigo-300 bg-indigo-900/20 border-indigo-800/40' : 'text-rose-300 bg-rose-900/20 border-rose-800/40'}`}>{v}</span>
                            <span className="text-gray-400 text-[9px] truncate">{label}</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : <p className="text-[10px] text-gray-600">أسلوب الحياة: غير مكتمل</p>}
                </Section>

                {/* 6. Intent */}
                <Section id="intent" icon="🎯" title="الهدف من اللقاء" pts="حتى 5 نقاط" open={openSections.has('intent')} onToggle={toggleSection}>
                  <Row icon="🧭" label="النية والهدف (Q40)" badge={intentBadge}
                    impact={`نفس الهدف = 5 نقاط · A+B = 4 · بقية المزيج = 2-3 نقاط · B مع غير B ممنوع (veto)`}
                    impactColor={s.intent_goal?.toUpperCase() === 'B' ? 'text-red-400' : 'text-gray-500'} />
                </Section>

              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Pair Detail Modal ─────────────────────────────────── */}
      {pairDetail?.type === 'match' && (() => {
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

      {/* TAB: FEEDBACK ──────────────────────────────────────────── */}
      {activeTab === "feedback" && (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Star size={16} className="text-yellow-400" /> تغذية التقييمات المباشرة
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setFeedbackPolling(p => !p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    feedbackPolling ? "bg-green-900/50 border-green-600 text-green-300" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
                  }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${feedbackPolling ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
                  {feedbackPolling ? "مباشر · 5ث" : "مباشر: إيقاف"}
                </button>
                <button onClick={fetchFeedback} disabled={feedbackLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-50">
                  <RefreshCw size={12} className={feedbackLoading ? "animate-spin" : ""} /> تحديث
                </button>
                <button onClick={async () => {
                  if (previewEventId != null) { toast.error("لا يمكن حذف التقييمات في وضع المعاينة"); return }
                  if (!confirm("حذف جميع التقييمات لهذه الفعالية؟ لا يمكن التراجع.")) return
                  const d = await api("e3-delete-feedback")
                  if (d.error) { toast.error(d.error); return }
                  toast.success("تم حذف جميع التقييمات")
                  fetchFeedback()
                }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-red-900/40 border border-red-700/30 text-red-400 hover:bg-red-900/60 transition-colors">
                  <Trash2 size={12} /> حذف الكل
                </button>
              </div>
            </div>
            {feedbackData && (
              <div className="grid grid-cols-2 gap-3">
                {([{id:"phase2",label:"💘 اختيارك",submitted:feedbackData.phase2_submitted,total:feedbackData.phase2?.length??0,color:"pink"},{id:"phase3",label:"🧠 الخوارزمية",submitted:feedbackData.phase3_submitted,total:feedbackData.phase3?.length??0,color:"purple"}] as any[]).map(ph => (
                  <button key={ph.id} onClick={() => setFeedbackPhase(ph.id)}
                    className={`rounded-xl p-3 text-center transition-all border ${
                      feedbackPhase === ph.id
                        ? ph.color === "pink" ? "bg-pink-900/30 border-pink-700/50" : "bg-purple-900/30 border-purple-700/50"
                        : "bg-gray-800/50 border-gray-700/50 hover:border-gray-600"
                    }`}>
                    <div className={`text-xl font-bold ${ph.color === "pink" ? "text-pink-300" : "text-purple-300"}`}>
                      {ph.submitted}<span className="text-gray-500 text-sm font-normal">/{ph.total}</span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{ph.label}</div>
                    <div className="h-1 bg-gray-700 rounded-full mt-2 overflow-hidden">
                      <div className={`h-full ${ph.color === "pink" ? "bg-pink-500" : "bg-purple-500"} rounded-full transition-all duration-500`}
                        style={{ width: `${ph.total > 0 ? (ph.submitted / ph.total) * 100 : 0}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search & Filter Bar */}
          {feedbackData && (
            <div className="flex flex-wrap items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  value={feedbackSearch}
                  onChange={(e) => setFeedbackSearch(e.target.value)}
                  placeholder="بحث بالاسم أو الرقم..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pr-9 pl-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1">
                {([["all","الكل"],["submitted","أُرسل"],["missing","لم يُرسل"],["mutual","توافق"]] as any[]).map(([id,label]) => (
                  <button key={id} onClick={() => setFeedbackFilter(id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                      feedbackFilter === id ? "bg-purple-900/40 border border-purple-600/50 text-purple-300" : "bg-gray-800 border border-gray-700/50 text-gray-500 hover:text-gray-300"
                    }`}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Entries */}
          {!feedbackData ? (
            <div className="text-center py-16">
              {feedbackLoading
                ? <Loader2 size={24} className="animate-spin mx-auto text-purple-400" />
                : <p className="text-sm text-gray-500">اضغط تحديث لتحميل التقييمات</p>}
            </div>
          ) : (() => {
            const allEntries: any[] = feedbackPhase === "phase2" ? (feedbackData.phase2 || []) : (feedbackData.phase3 || [])
            const stars = (n: number) => Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={i < n ? "text-yellow-400" : "text-gray-700"}>★</span>
            ))
            // Apply search
            const searchNum = feedbackSearch.replace(/[^0-9]/g, "")
            const searchLower = feedbackSearch.toLowerCase().trim()
            let entries = allEntries
            if (searchLower || searchNum) {
              entries = allEntries.filter((e: any) =>
                e.participant_name?.toLowerCase().includes(searchLower) ||
                e.partner_name?.toLowerCase().includes(searchLower) ||
                String(e.participant_number) === searchNum ||
                String(e.partner_number) === searchNum
              )
            }
            // Apply filter
            if (feedbackFilter === "submitted") entries = entries.filter((e: any) => e.submitted)
            else if (feedbackFilter === "missing") entries = entries.filter((e: any) => !e.submitted)
            else if (feedbackFilter === "mutual") entries = entries.filter((e: any) => e.mutual_yes)
            const submitted = entries.filter((e: any) => e.submitted)
              .sort((a: any, b: any) => (b.mutual_yes === true ? 1 : 0) - (a.mutual_yes === true ? 1 : 0))
            const missing = entries.filter((e: any) => !e.submitted)
            // Pair-level analysis: group by pair, count where both submitted
            const pairMap: Record<string, { a?: any; b?: any }> = {}
            for (const e of entries) {
              const key = [e.participant_number, e.partner_number].sort((x, y) => x - y).join("-")
              if (!pairMap[key]) pairMap[key] = {}
              if (e.participant_number < e.partner_number) pairMap[key].a = e
              else pairMap[key].b = e
            }
            const bothSubmittedPairs = Object.values(pairMap).filter(p => p.a?.submitted && p.b?.submitted)
            const mutualPairs = bothSubmittedPairs.filter(p => {
              const aFb = p.a?.feedback || {}
              const bFb = p.b?.feedback || {}
              return aFb.wantConnect === true && bFb.wantConnect === true
            })
            const notMutualPairs = bothSubmittedPairs.length - mutualPairs.length
            return (
              <div className="space-y-5">
              {/* Analysis summary */}
              {bothSubmittedPairs.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-gray-300">تحليل المطابقة المتبادلة</span>
                    <span className="text-[10px] text-gray-600">({feedbackPhase === "phase2" ? "اختيارك" : "الخوارزمية"})</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-gray-950/60 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-white">{bothSubmittedPairs.length}</div>
                      <div className="text-[9px] text-gray-500">كلاهما أرسل</div>
                    </div>
                    <div className="bg-emerald-950/40 border border-emerald-800/30 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-emerald-400">{mutualPairs.length}</div>
                      <div className="text-[9px] text-emerald-500">ارادوا التواصل</div>
                    </div>
                    <div className="bg-gray-950/60 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-gray-400">{notMutualPairs}</div>
                      <div className="text-[9px] text-gray-500">لم يرغبوا</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-gray-500">
                    <span className="text-emerald-400 font-bold">{mutualPairs.length}</span>
                    <span>/</span>
                    <span className="text-white font-bold">{bothSubmittedPairs.length}</span>
                    <span>مطابقة متبادلة</span>
                  </div>
                </div>
              )}
                {submitted.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 font-medium mb-2 flex items-center gap-1.5">
                      <CheckCircle size={11} className="text-green-400" /> أرسلوا التقييم ({submitted.length})
                    </p>
                    <div className="space-y-2.5">
                      {submitted.map((entry: any) => {
                        const fb = entry.feedback || {}
                        const mutualYes = entry.mutual_yes === true || (fb.wantConnect === true && entry.partner_feedback?.wantConnect === true)
                        const prefLabel = entry.match_preference === 'choice' ? 'اختيار شخصي'
                          : entry.match_preference === 'algorithm' ? 'الخوارزمية'
                          : entry.match_preference === 'both' ? 'كلاهما' : null
                        const pfbTop = entry.partner_feedback || {}
                        return (
                          <div key={entry.participant_number}
                            className={`bg-gray-900 border rounded-xl overflow-hidden ${
                              mutualYes ? "border-emerald-500/60 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]" : "border-gray-800"
                            }`}>
                            {/* Mutual banner */}
                            {mutualYes && (
                              <div className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-l from-emerald-900/50 to-emerald-950/30 border-b border-emerald-800/40">
                                <Heart size={12} className="text-emerald-400 fill-emerald-400" />
                                <span className="text-emerald-300 text-[11px] font-bold">توافق متبادل — كلاهما أراد التواصل</span>
                              </div>
                            )}
                            {/* Header row */}
                            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800/40 border-b border-gray-800">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${feedbackPhase === "phase2" ? "bg-pink-500" : "bg-purple-500"}`} />
                                <span className="font-semibold text-white text-sm truncate">{entry.participant_name}</span>
                                <span className="text-gray-600 text-[10px] flex-shrink-0">#{entry.participant_number}</span>
                                <ArrowLeft size={11} className="text-gray-600 flex-shrink-0" />
                                <span className="text-gray-300 text-sm truncate">{entry.partner_name}</span>
                                <span className="text-gray-600 text-[10px] flex-shrink-0">#{entry.partner_number}</span>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {entry.compat_score != null && (
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                    entry.compat_score >= 75 ? "bg-emerald-950/50 text-emerald-400" :
                                    entry.compat_score >= 55 ? "bg-blue-950/50 text-blue-400" :
                                    "bg-gray-800 text-gray-400"
                                  }`}>توافق: {entry.compat_score}%</span>
                                )}
                                <button
                                  onClick={() => openPairAnalysis(entry, feedbackPhase)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-gray-500 hover:text-amber-300 hover:bg-gray-800 transition-colors"
                                >
                                  <Sparkles size={10} /> تحليل
                                </button>
                                <button
                                  onClick={() => setEditingFeedback({ entry, phase: feedbackPhase })}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-gray-500 hover:text-purple-300 hover:bg-gray-800 transition-colors"
                                >
                                  <Pencil size={10} /> تعديل
                                </button>
                              </div>
                            </div>

                            {/* Want-connect: both sides shown side by side */}
                            <div className="grid grid-cols-2 gap-2 px-4 pt-2.5">
                              <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${
                                fb.wantConnect === true ? "bg-emerald-950/40" : fb.wantConnect === false ? "bg-gray-800/60" : "bg-gray-800/30"
                              }`}>
                                <span className="text-[10px] text-gray-400 truncate">{entry.participant_name}</span>
                                <span className={`text-[10px] font-bold ${fb.wantConnect === true ? "text-emerald-400" : fb.wantConnect === false ? "text-gray-500" : "text-gray-600"}`}>
                                  {fb.wantConnect === true ? "نعم" : fb.wantConnect === false ? "لا" : "—"}
                                </span>
                              </div>
                              <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${
                                pfbTop.wantConnect === true ? "bg-emerald-950/40" : entry.partner_submitted ? "bg-gray-800/60" : "bg-gray-800/20"
                              }`}>
                                <span className="text-[10px] text-gray-400 truncate">{entry.partner_name}</span>
                                <span className={`text-[10px] font-bold ${
                                  pfbTop.wantConnect === true ? "text-emerald-400" : entry.partner_submitted ? "text-gray-500" : "text-gray-600"
                                }`}>
                                  {!entry.partner_submitted ? "لم يُرسل" : pfbTop.wantConnect === true ? "نعم" : pfbTop.wantConnect === false ? "لا" : "—"}
                                </span>
                              </div>
                            </div>

                            {/* Secondary tags */}
                            {prefLabel && (
                              <div className="px-4 pt-1.5">
                                <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-md">تفضيله: {prefLabel}</span>
                              </div>
                            )}

                            {/* Ratings */}
                            <div className="px-4 py-3 space-y-1.5">
                              {fb.conversationQuality > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-500">جودة المحادثة</span>
                                  <span>{stars(fb.conversationQuality)}</span>
                                </div>
                              )}
                              {fb.personalConnection > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-500">التواصل الشخصي</span>
                                  <span>{stars(fb.personalConnection)}</span>
                                </div>
                              )}
                              {fb.sliderMoved && fb.compatibilityRate != null && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-500">تخمين درجة التوافق</span>
                                  <span className={`font-bold ${
                                    fb.compatibilityRate >= 80 ? 'text-emerald-400' :
                                    fb.compatibilityRate >= 60 ? 'text-amber-400' :
                                    fb.compatibilityRate >= 40 ? 'text-orange-400' : 'text-red-400'
                                  }`}>{fb.compatibilityRate}%
                                    {entry.compat_score != null && (
                                      <span className="text-gray-600 font-normal text-[10px] mr-1">(الفعلي: {entry.compat_score}%)</span>
                                    )}
                                  </span>
                                </div>
                              )}
                              {fb.organizerImpression && (
                                <div className="mt-2 bg-gray-800/60 rounded-lg p-2.5 text-gray-300 text-[11px] text-right leading-relaxed">💬 {fb.organizerImpression}</div>
                              )}
                              {entry.partner_submitted && entry.partner_feedback && (() => {
                                const pfb = entry.partner_feedback
                                return (
                                  <div className="mt-3 pt-3 border-t border-gray-800 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <p className="text-[10px] text-gray-500 font-medium">تقييم {entry.partner_name}</p>
                                      <div className="flex items-center gap-1.5">
                                        {entry.partner_other_compat_score != null && (
                                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                                            entry.partner_other_compat_score >= 75 ? "bg-emerald-950/50 text-emerald-400" :
                                            entry.partner_other_compat_score >= 55 ? "bg-blue-950/50 text-blue-400" :
                                            "bg-gray-800 text-gray-400"
                                          }`}>
                                            مع {entry.partner_other_partner_name}: {entry.partner_other_compat_score}%
                                          </span>
                                        )}
                                        {entry.compat_diff != null && (
                                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                                            entry.compat_diff > 0 ? "bg-emerald-950/40 text-emerald-300" :
                                            entry.compat_diff < 0 ? "bg-amber-950/40 text-amber-300" :
                                            "bg-gray-800 text-gray-400"
                                          }`}>
                                            الفارق: {entry.compat_diff > 0 ? "+" : ""}{entry.compat_diff}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {pfb.conversationQuality > 0 && (
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-600">جودة المحادثة</span>
                                        <span>{stars(pfb.conversationQuality)}</span>
                                      </div>
                                    )}
                                    {pfb.personalConnection > 0 && (
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-600">التواصل الشخصي</span>
                                        <span>{stars(pfb.personalConnection)}</span>
                                      </div>
                                    )}
                                    {pfb.sliderMoved && pfb.compatibilityRate != null && (
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-600">تخمين درجة التوافق</span>
                                        <span className={`font-bold ${
                                          pfb.compatibilityRate >= 80 ? 'text-emerald-400' :
                                          pfb.compatibilityRate >= 60 ? 'text-amber-400' :
                                          pfb.compatibilityRate >= 40 ? 'text-orange-400' : 'text-red-400'
                                        }`}>{pfb.compatibilityRate}%
                                          {entry.compat_score != null && (
                                            <span className="text-gray-600 font-normal text-[10px] mr-1">(الفعلي: {entry.compat_score}%)</span>
                                          )}
                                        </span>
                                      </div>
                                    )}
                                    {pfb.organizerImpression && (
                                      <div className="mt-1.5 bg-gray-800/60 rounded-lg p-2.5 text-gray-300 text-[11px] text-right leading-relaxed">💬 {pfb.organizerImpression}</div>
                                    )}
                                  </div>
                                )
                              })()}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {missing.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 font-medium mb-2 flex items-center gap-1.5">
                      <AlertCircle size={11} className="text-yellow-400" /> لم يُرسلوا بعد ({missing.length})
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {missing.map((entry: any) => (
                        <div key={entry.participant_number} className="bg-gray-900/50 border border-gray-800 rounded-xl p-3 opacity-55 relative group">
                          <p className="text-sm font-medium text-gray-400 truncate">{entry.participant_name}</p>
                          <p className="text-[10px] text-gray-600 mt-0.5">مع {entry.partner_name}</p>
                          <button
                            onClick={() => setEditingFeedback({ entry, phase: feedbackPhase })}
                            className="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] bg-gray-800/80 border border-gray-700/50 text-gray-400 hover:text-purple-300 transition-all"
                          >
                            <Pencil size={9} /> تعديل
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {entries.length === 0 && (
                  <div className="text-center py-10 text-gray-600 text-sm">لا توجد نتائج مطابقة للبحث</div>
                )}
              </div>
            )
          })()}

          {/* Feedback Edit Modal */}
          {editingFeedback && (
            <FeedbackEditModal
              entry={editingFeedback.entry}
              phase={editingFeedback.phase}
              onClose={() => setEditingFeedback(null)}
              onSave={async (newFb) => {
                const ok = await handleEditFeedbackRef.current(editingFeedback.entry.participant_number, editingFeedback.phase, newFb)
                if (ok) setEditingFeedback(null)
              }}
            />
          )}

          {/* Pair Analysis Modal */}
          {analyzingPair && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setAnalyzingPair(null)}>
              <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                      <Sparkles size={14} className="text-amber-400" /> تحليل من منظور {analyzingPair.entry.participant_name}
                      {pairAnalysisResult?.event_id != null && (
                        <span className="text-[9px] font-normal px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">فعالية {pairAnalysisResult.event_id}</span>
                      )}
                    </h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      مقارنة مع {pairAnalysisResult?.partner?.name || analyzingPair.entry.partner_name} #{pairAnalysisResult?.partner?.number || analyzingPair.entry.partner_number}
                      {pairAnalysisResult?.alternative && (
                        <span> مقابل شريك {pairAnalysisResult.alternative.phase === "phase3" ? "الخوارزمية" : "اختيار المشاركين"}: {pairAnalysisResult.alternative.name} #{pairAnalysisResult.alternative.number}</span>
                      )}
                    </p>
                  </div>
                  <button onClick={() => setAnalyzingPair(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
                </div>

                {pairAnalysisLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 size={24} className="animate-spin text-amber-400" />
                    <p className="text-xs text-gray-500">جاري تحليل المطابقة...</p>
                  </div>
                ) : pairAnalysisResult ? (
                  <div className="space-y-4">
                    {/* Perspective header */}
                    <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-3">
                      <p className="text-[10px] text-gray-500 mb-2">منظور المشارك</p>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold text-white">{pairAnalysisResult.subject?.name || analyzingPair?.entry.participant_name}</span>
                        <span className="text-gray-600">#{pairAnalysisResult.subject?.number || analyzingPair?.entry.participant_number}</span>
                        <ArrowLeft size={14} className="text-gray-600" />
                        <span className="font-semibold text-gray-300">{pairAnalysisResult.partner?.name || analyzingPair?.entry.partner_name}</span>
                        <span className="text-gray-600">#{pairAnalysisResult.partner?.number || analyzingPair?.entry.partner_number}</span>
                      </div>
                      {pairAnalysisResult.alternative && (
                        <div className="mt-2 text-[11px] text-gray-400">
                          مقارنةً بشريك {pairAnalysisResult.alternative.phase === "phase3" ? "الخوارزمية" : "اختيار المشاركين"}: <span className="text-amber-300 font-semibold">{pairAnalysisResult.alternative.name} #{pairAnalysisResult.alternative.number}</span>
                        </div>
                      )}
                    </div>

                    {/* Algorithmic comparison table */}
                    {(pairAnalysisResult.actualBreakdown || pairAnalysisResult.alternativeBreakdown) && (
                      <div>
                        <p className="text-[10px] text-gray-500 mb-1.5">مقارنة درجات التوافق (الجولة الحالية × الجولة الأخرى)</p>
                        <div className="bg-gray-800/50 rounded-xl overflow-hidden text-[11px]">
                          <div className="grid grid-cols-4 gap-2 p-2 border-b border-gray-700/50 text-gray-500 text-[10px]">
                            <span>المعيار</span>
                            <span className="text-center">الجولة الحالية</span>
                            <span className="text-center">الجولة الأخرى</span>
                            <span className="text-center">الفارق</span>
                          </div>
                          {[
                            { key: "total", label: "الإجمالي" },
                            { key: "synergy", label: "التناغم" },
                            { key: "vibe", label: "الجاذبية" },
                            { key: "lifestyle", label: "نمط الحياة" },
                            { key: "communication", label: "التواصل" },
                            { key: "coreValues", label: "القيم" },
                            { key: "intent", label: "الهدف" },
                          ].map(({ key, label }) => {
                            const actual = pairAnalysisResult.actualBreakdown?.[key] ?? "—"
                            const alt = pairAnalysisResult.alternativeBreakdown?.[key] ?? "—"
                            const gap = pairAnalysisResult.diff?.[key]
                            const isLargest = pairAnalysisResult.largestGapKey === key
                            const gapNum = typeof gap === "number" ? gap : null
                            return (
                              <div key={key} className={`grid grid-cols-4 gap-2 p-2 border-b border-gray-700/30 ${isLargest ? "bg-amber-950/20" : ""}`}>
                                <span className="text-gray-400">{label}</span>
                                <span className="text-center text-white font-semibold">{actual}</span>
                                <span className="text-center text-gray-300">{alt}</span>
                                <span className={`text-center font-bold ${gapNum === null ? "text-gray-500" : gapNum > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                                  {gapNum !== null ? `${gapNum > 0 ? "+" : ""}${gapNum}` : "—"}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                        <p className="text-[9px] text-gray-600 mt-1.5">
                          الفارق = شريك الجولة الأخرى - شريك الجولة الحالية. القيمة الموجبة تعني أن الدرجة كانت أعلى مع شريك الجولة الأخرى.
                        </p>
                      </div>
                    )}

                    {/* Feedback used */}
                    {pairAnalysisResult.feedback && (
                      <div>
                        <p className="text-[10px] text-gray-500 mb-1.5">تقييم المشارك الفعلي المُستخدم في التحليل</p>
                        <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-3 grid grid-cols-2 gap-2 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">أراد التواصل</span>
                            <span className={`font-bold ${pairAnalysisResult.feedback.wantConnect === true ? "text-emerald-400" : pairAnalysisResult.feedback.wantConnect === false ? "text-gray-500" : "text-gray-600"}`}>
                              {pairAnalysisResult.feedback.wantConnect === true ? "نعم" : pairAnalysisResult.feedback.wantConnect === false ? "لا" : "—"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">جودة المحادثة</span>
                            <span className="text-white font-semibold">{pairAnalysisResult.feedback.conversationQuality || "—"}/5</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">التواصل الشخصي</span>
                            <span className="text-white font-semibold">{pairAnalysisResult.feedback.personalConnection || "—"}/5</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">درجة التوافق</span>
                            <span className="text-white font-semibold">{pairAnalysisResult.feedback.compatibilityRate || "—"}</span>
                          </div>
                          {pairAnalysisResult.feedback.organizerImpression && (
                            <div className="col-span-2 mt-1 bg-gray-800/60 rounded-lg p-2.5 text-gray-300 text-[11px] leading-relaxed text-right">
                              💬 {pairAnalysisResult.feedback.organizerImpression}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* AI analysis */}
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1.5">تحليل المعايرة</p>
                      <div className="bg-gray-800/60 rounded-xl p-4 text-gray-200 text-[13px] leading-relaxed text-right whitespace-pre-line">
                        {pairAnalysisResult.analysis}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-gray-500 text-sm py-8">تعذّر تحميل التحليل</p>
                )}
              </div>
            </div>
          )}

          {/* Mood Check Results */}
          <div className="bg-gray-900 border border-purple-800/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Heart size={16} className="text-purple-400" /> فحص المزاج
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={fetchMoodChecks} disabled={moodLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-50">
                  <RefreshCw size={12} className={moodLoading ? "animate-spin" : ""} /> تحديث
                </button>
              </div>
            </div>

            {!moodData?.checks?.length ? (
              <p className="text-center text-gray-600 text-sm py-6">لا توجد فحوصات مزاج بعد</p>
            ) : (
              <div className="space-y-3">
                {moodData.checks.map((check: any) => {
                  const entries: any[] = check.entries || []
                  const answered = entries.filter(e => e.mood && e.mood !== "expired")
                  const happy = answered.filter(e => e.mood === "happy")
                  const neutral = answered.filter(e => e.mood === "neutral")
                  const notGreat = answered.filter(e => e.mood === "not_great")
                  const expired = entries.filter(e => e.mood === "expired")
                  const pending = entries.filter(e => !e.mood)
                  const time = new Date(check.triggered_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })
                  const moodEmoji = (m: string) => m === "happy" ? "😊" : m === "neutral" ? "😐" : m === "not_great" ? "😕" : "⏰"
                  const moodColor = (m: string) => m === "happy" ? "text-emerald-400" : m === "neutral" ? "text-amber-400" : m === "not_great" ? "text-red-400" : "text-gray-500"
                  const moodLabel = (m: string) => m === "happy" ? "ممتاز" : m === "neutral" ? "عادي" : m === "not_great" ? "مو مره" : "انتهى"
                  const fmtTime = (t: string) => t ? new Date(t).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : ""
                  return (
                    <div key={check.check_id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400 font-medium">{time}</span>
                        <span className="text-[10px] text-gray-500">{answered.length}/{entries.length} ردّوا{expired.length > 0 && ` · ${expired.length} انتهى`}</span>
                      </div>
                      {/* Summary counts */}
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className="text-center bg-green-900/20 rounded-lg py-2">
                          <div className="text-lg">😊</div>
                          <div className="text-green-400 text-sm font-bold">{happy.length}</div>
                          <div className="text-[9px] text-gray-500">ممتاز</div>
                        </div>
                        <div className="text-center bg-yellow-900/20 rounded-lg py-2">
                          <div className="text-lg">😐</div>
                          <div className="text-yellow-400 text-sm font-bold">{neutral.length}</div>
                          <div className="text-[9px] text-gray-500">عادي</div>
                        </div>
                        <div className="text-center bg-red-900/20 rounded-lg py-2">
                          <div className="text-lg">😕</div>
                          <div className="text-red-400 text-sm font-bold">{notGreat.length}</div>
                          <div className="text-[9px] text-gray-500">مو مره</div>
                        </div>
                        <div className="text-center bg-gray-700/20 rounded-lg py-2">
                          <div className="text-lg">{pending.length > 0 ? "⏳" : "⏰"}</div>
                          <div className="text-gray-400 text-sm font-bold">{pending.length}{expired.length > 0 ? `+${expired.length}` : ""}</div>
                          <div className="text-[9px] text-gray-500">{pending.length > 0 ? "بانتظار" : "انتهى"}</div>
                        </div>
                      </div>
                      {/* Detailed responses */}
                      {[...answered, ...expired].length > 0 && (
                        <div className="space-y-1 mb-2">
                          <p className="text-[10px] text-gray-500 font-medium mb-1">الردود:</p>
                          {[...answered, ...expired].sort((a, b) => new Date(b.answered_at).getTime() - new Date(a.answered_at).getTime()).map(e => (
                            <div key={e.participant_number} className="flex items-center justify-between bg-gray-800/60 rounded-lg px-2.5 py-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{moodEmoji(e.mood)}</span>
                                <span className="text-xs text-gray-300 font-medium">{e.participant_name}</span>
                                <span className="text-[10px] text-gray-600">#{e.participant_number}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-medium ${moodColor(e.mood)}`}>{moodLabel(e.mood)}</span>
                                <span className="text-[10px] text-gray-600">{fmtTime(e.answered_at)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Pending participants */}
                      {pending.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-[10px] text-gray-500">بانتظار:</span>
                          {pending.map(e => (
                            <span key={e.participant_number} className="text-[10px] bg-gray-700/40 text-gray-400 rounded-full px-2 py-0.5">
                              {e.participant_name} #{e.participant_number}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Notification Results */}
          <div className="bg-gray-900 border border-blue-800/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Bell size={16} className="text-blue-400" /> الإشعارات
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={fetchNotifications} disabled={notifLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-50">
                  <RefreshCw size={12} className={notifLoading ? "animate-spin" : ""} /> تحديث
                </button>
              </div>
            </div>

            {!notifData?.notifications?.length ? (
              <p className="text-center text-gray-600 text-sm py-6">لا توجد إشعارات بعد</p>
            ) : (
              <div className="space-y-3">
                {notifData.notifications.map((n: any) => {
                  const entries: any[] = n.entries || []
                  const seen = entries.filter(e => e.seen_at)
                  const unseen = entries.filter(e => !e.seen_at)
                  const time = new Date(n.created_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })
                  const iconEmoji: Record<string, string> = { info: "ℹ️", heart: "❤️", clock: "⏰", star: "⭐", alert: "⚠️" }
                  return (
                    <div key={n.notif_id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{iconEmoji[n.icon] || "ℹ️"}</span>
                          <span className="text-xs text-gray-300 font-bold">{n.title}</span>
                        </div>
                        <span className="text-[10px] text-gray-500">{time}</span>
                      </div>
                      {n.body && <p className="text-[11px] text-gray-500 mb-2">{n.body}</p>}
                      <div className="flex items-center justify-between text-[10px] text-gray-500">
                        <span>شاهد: {seen.length}/{entries.length}</span>
                        {unseen.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {unseen.map(e => (
                              <span key={e.participant_number} className="bg-gray-700/40 text-gray-400 rounded-full px-2 py-0.5">
                                {e.participant_name} #{e.participant_number}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── SOS Modal ──────────────────────────────────────────── */}
      {sosModalOpen && (() => {
        const sorted = [...sosRequests].sort((a, b) => {
          const order: Record<string, number> = { pending: 0, seen: 1, replied: 2, resolved: 3 }
          return (order[a.status] ?? 9) - (order[b.status] ?? 9)
        })
        const selected = sorted.find(r => r.id === selectedSosId) || sorted[0] || null
        const selId = selected?.id || null
        const chatHistory: { from: string; text: string; timestamp: string }[] = Array.isArray(selected?.chat_history) ? selected.chat_history : []
        const isOrganizerNeeded = selected?.request_type === 'organizer_needed'
        return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4" dir="rtl">
          <div className="bg-gray-900 border border-gray-800 rounded-none sm:rounded-3xl w-full sm:max-w-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '100vh', height: '100vh' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gradient-to-l from-red-950/30 to-gray-900 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center text-white text-sm font-bold">ع</div>
                <div>
                  <h2 className="font-bold text-white text-sm leading-tight">طلبات المساعدة والرسائل</h2>
                  <p className="text-gray-500 text-[10px] leading-tight">{sosRequests.filter(r => r.status !== 'resolved').length} نشط · {sosRequests.length} الإجمالي</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {sosRequests.length > 0 && (
                  <button onClick={async () => {
                    if (!confirm("حذف جميع طلبات المساعدة؟ لا يمكن التراجع.")) return
                    await api("e3-reset-sos")
                    setSosRequests([])
                    setSelectedSosId(null)
                    toast.success("تم حذف جميع الطلبات")
                  }}
                    className="px-2.5 py-1 rounded-lg bg-red-900/40 border border-red-700/30 text-red-400 hover:bg-red-900/60 text-[11px] font-medium transition-colors">
                    حذف الكل
                  </button>
                )}
                <button onClick={() => setSosModalOpen(false)} className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Two-panel body — mobile: full-screen chat with back button, desktop: side-by-side */}
            <div className="flex flex-1 overflow-hidden">

              {/* Conversation list — hidden on mobile when a chat is selected */}
              <div className={`${selected ? 'hidden sm:flex' : 'flex'} sm:w-60 sm:border-l border-gray-800/60 flex-col flex-shrink-0`}>
                <div className="flex gap-1 px-2 py-2 border-b border-gray-800/40 bg-gray-900/30 flex-shrink-0">
                  {[
                    { id: 'all', label: 'الكل' },
                    { id: 'active', label: 'نشط' },
                  ].map(tab => (
                    <button key={tab.id} onClick={() => setSosFilter(tab.id as any)}
                      className={`flex-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                        sosFilter === tab.id ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                      }`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {sorted.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-600 gap-2">
                      <div className="w-10 h-10 rounded-full bg-gray-800/50 flex items-center justify-center">
                        <AlertCircle size={18} className="text-gray-700" />
                      </div>
                      <p className="text-xs">لا توجد طلبات</p>
                    </div>
                  )}
                  {sorted
                    .filter(r => sosFilter === 'all' ? true : r.status !== 'resolved')
                    .map(req => {
                    const isSel = req.id === selId
                    const isFlashing = flashIds.has(req.id)
                    const tableMatch = req.table_info?.match(/طاولة\s*(\d+)/)
                    const tableNum = tableMatch ? tableMatch[1] : null
                    const isOrgNeeded = req.request_type === 'organizer_needed'
                    const lastMsg = Array.isArray(req.chat_history) && req.chat_history.length > 0
                      ? req.chat_history[req.chat_history.length - 1]
                      : null
                    return (
                      <button key={req.id} onClick={() => setSelectedSosId(req.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-3 border-b border-gray-800/30 text-right transition-colors ${
                          isSel ? 'bg-gray-800/80' : 'hover:bg-gray-800/40'
                        } ${isFlashing ? 'ring-1 ring-inset ring-red-500/40' : ''}`}>
                        <div className="relative flex-shrink-0">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                            isOrgNeeded ? 'bg-red-600/30 text-red-400' :
                            req.status === 'pending' ? 'bg-orange-600/30 text-orange-400' :
                            req.status === 'replied' ? 'bg-emerald-600/20 text-emerald-400' :
                            req.status === 'seen' ? 'bg-blue-600/20 text-blue-400' :
                            'bg-gray-700 text-gray-500'
                          }`}>{req.participant_name?.charAt(0) || '؟'}</div>
                          {tableNum && (
                            <span className="absolute -bottom-1 -left-1 bg-gray-900 border border-gray-700 text-[8px] font-bold text-gray-300 rounded-full px-1 leading-none py-0.5 flex items-center gap-0.5">
                              <Table2 size={7} />{tableNum}
                            </span>
                          )}
                          {req.status === 'pending' && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-gray-900 animate-pulse" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-white text-xs font-semibold truncate">{req.participant_name}</span>
                              <span className="text-gray-600 text-[9px] font-mono flex-shrink-0">#{req.participant_number}</span>
                            </div>
                            <span className="text-gray-600 text-[9px] flex-shrink-0">{new Date(req.updated_at || req.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {isOrgNeeded && (
                              <span className="text-[8px] bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium">🆘 منظم</span>
                            )}
                            <p className="text-gray-500 text-[10px] truncate">
                              {lastMsg ? (lastMsg.from === 'organizer' ? 'أنت: ' : '') + lastMsg.text : (req.message || req.organizer_reply || '—')}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Chat panel — full screen on mobile when selected */}
              <div className={`${selected ? 'flex' : 'hidden sm:flex'} flex-1 flex-col`}>
                {selected ? (
                  <>
                    {/* Chat header with back button for mobile */}
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-800/40 bg-gray-900/30 flex-shrink-0">
                      <button onClick={() => setSelectedSosId(null)} className="sm:hidden w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors flex-shrink-0">
                        <ChevronRight size={16} />
                      </button>
                      <div className="relative flex-shrink-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                          isOrganizerNeeded ? 'bg-red-600/30 text-red-400' :
                          selected.status === 'pending' ? 'bg-orange-600/30 text-orange-400' :
                          selected.status === 'replied' ? 'bg-emerald-600/20 text-emerald-400' :
                          selected.status === 'seen' ? 'bg-blue-600/20 text-blue-400' :
                          'bg-gray-700 text-gray-500'
                        }`}>{selected.participant_name?.charAt(0) || '؟'}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-white text-sm font-semibold truncate">{selected.participant_name}</span>
                          <span className="text-gray-600 text-[10px] font-mono flex-shrink-0">#{selected.participant_number}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-gray-500 text-[10px] truncate">{selected.table_info}</span>
                          {isOrganizerNeeded && (
                            <span className="text-[8px] bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 flex-shrink-0">
                              <AlertCircle size={8} /> يحتاج منظم
                            </span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => handleSOSAction(selId!, null, 'resolved')}
                        className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-emerald-400 transition-colors flex items-center justify-center flex-shrink-0"
                        title="تم الحل">
                        <CheckCircle size={15} />
                      </button>
                    </div>

                    {/* Messages from chat_history */}
                    <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-2.5 bg-gray-950/30">
                      {chatHistory.length === 0 && (
                        <div className="text-center py-8 text-gray-600 text-xs">لا توجد رسائل</div>
                      )}
                      {chatHistory.map((msg, i) => (
                        <div key={i} className={`flex ${msg.from === 'user' ? 'justify-start' : 'justify-end'}`}>
                          <div className="max-w-[80%]">
                            <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                              msg.from === 'user'
                                ? 'bg-gray-800 text-gray-200 rounded-bl-md'
                                : 'bg-emerald-900/30 border border-emerald-700/30 text-emerald-200 rounded-br-md'
                            }`}>
                              {msg.from === 'organizer' && <p className="text-emerald-400/80 text-[9px] font-bold mb-0.5">عبدالرحمن</p>}
                              {msg.text}
                            </div>
                            <p className={`text-gray-700 text-[9px] mt-1 ${msg.from === 'user' ? 'mr-1' : 'ml-1 text-left'}`}>
                              {new Date(msg.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Inline reply input — always visible */}
                    {selected.status !== 'resolved' && (
                      <div className="border-t border-gray-800/60 p-2.5 sm:p-3 bg-gray-900/50 flex-shrink-0">
                        <div className="flex items-end gap-2">
                          <textarea
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (replyText.trim()) handleSOSAction(selId!, replyText, 'replied') } }}
                            placeholder="اكتب ردك..."
                            rows={1}
                            className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-2xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600 resize-none placeholder-gray-600 max-h-24"
                            style={{ minHeight: '40px' }}
                          />
                          <button
                            onClick={() => { if (replyText.trim()) handleSOSAction(selId!, replyText, 'replied') }}
                            disabled={!replyText.trim()}
                            className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white flex items-center justify-center transition-colors flex-shrink-0"
                          >
                            <Send size={15} />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3">
                    <div className="w-14 h-14 rounded-full bg-gray-800/50 flex items-center justify-center">
                      <MessageSquare size={24} className="text-gray-700" />
                    </div>
                    <p className="text-sm">اختر محادثة من القائمة</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* ─── Initiate Chat Modal ─────────────────────────────────── */}
      {initiateChatOpen && initiateChatTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-gray-900 border border-gray-700/60 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-base flex items-center gap-2">
                <MessageSquare size={16} className="text-emerald-400" />
                مراسلة {initiateChatTarget.name} (#{initiateChatTarget.number})
              </h3>
              <button onClick={() => { setInitiateChatOpen(false); setInitiateChatText(""); setInitiateChatTarget(null) }}
                className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>
            <textarea
              value={initiateChatText}
              onChange={e => setInitiateChatText(e.target.value)}
              placeholder="اكتب رسالتك للمشارك..."
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 resize-none placeholder:text-gray-600 transition-all"
            />
            <button
              onClick={initiateChat}
              disabled={!initiateChatText.trim() || initiateSending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {initiateSending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              إرسال الرسالة
            </button>
          </div>
        </div>
      )}

      {/* ── Swap Match Modal ─────────────────────────────────────────── */}
      {swapMatch && (() => {
        const phaseLabel = swapMatch.phase === "phase2" ? "اختيارك" : "الخوارزمية"
        const currentPairs = swapMatch.phase === "phase2" ? matchPairs : phase3Pairs
        const availableParticipants = participants.filter(p =>
          p.number !== swapMatch.missingNum &&
          !currentPairs.some(mp => mp.a === p.number || mp.b === p.number)
        )
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => { setSwapMatch(null); setSwapReplacement(null) }} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden" dir="rtl">
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <div>
                  <h3 className="font-bold text-white text-sm">استبدال مشارك</h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">مطابقة {phaseLabel} · استبدال {swapMatch.missingName} (#{swapMatch.missingNum})</p>
                </div>
                <button onClick={() => { setSwapMatch(null); setSwapReplacement(null) }} className="p-2 rounded-xl hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">✕</button>
              </div>
              <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                <p className="text-xs text-gray-400">اختر المشارك البديل:</p>
                <div className="space-y-1.5">
                  {availableParticipants.length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-4">لا يوجد مشاركون متاحون للاستبدال</p>
                  ) : availableParticipants.map(p => (
                    <button
                      key={p.number}
                      onClick={() => setSwapReplacement(p.number)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-right ${
                        swapReplacement === p.number
                          ? 'bg-amber-900/40 border border-amber-700/50'
                          : 'bg-gray-800/50 border border-transparent hover:bg-gray-800'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                      <span className="text-sm font-semibold text-white flex-1 truncate">{p.name}</span>
                      <span className="text-[10px] text-gray-500">#{p.number}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 border-t border-gray-800 flex gap-2">
                <button
                  onClick={() => { setSwapMatch(null); setSwapReplacement(null) }}
                  className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={doSwapMatch}
                  disabled={!swapReplacement || !!loading}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {loading?.startsWith("swap-match") ? <RefreshCw size={14} className="animate-spin" /> : <Shuffle size={14} />}
                  تأكيد الاستبدال
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {/* ── Replace Participant Modal ─────────────────────────────────── */}
      {replaceParticipant && (() => {
        const allPeople = participants
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => { setReplaceParticipant(null); setReplaceWith(null) }} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden" dir="rtl">
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <div>
                  <h3 className="font-bold text-white text-sm">استبدال مشارك بالكامل</h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">استبدال {replaceParticipant.oldName} (#{replaceParticipant.oldNum}) في جميع الجداول</p>
                </div>
                <button onClick={() => { setReplaceParticipant(null); setReplaceWith(null) }} className="p-2 rounded-xl hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">✕</button>
              </div>
              <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                <div className="bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2.5">
                  <p className="text-[11px] text-red-300 leading-relaxed">
                    ⚠️ سيتم استبدال المشارك في كل شيء: الطاولات، المطابقات، التصنيفات، الملاحظات، والإشعارات. لن يتم إعادة حساب أي شيء إلا نقطة التوافق للمطابقة الثانية (phase3) للزوج الجديد فقط.
                  </p>
                </div>
                <p className="text-xs text-gray-400">اختر المشارك البديل (يمكن أن يكون أي شخص):</p>
                <div className="space-y-1.5">
                  {allPeople.length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-4">لا يوجد مشاركون</p>
                  ) : allPeople
                    .filter(p => p.number !== replaceParticipant.oldNum)
                    .map(p => (
                    <button
                      key={p.number}
                      onClick={() => setReplaceWith(p.number)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-right ${
                        replaceWith === p.number
                          ? 'bg-red-900/40 border border-red-700/50'
                          : 'bg-gray-800/50 border border-transparent hover:bg-gray-800'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                      <span className="text-sm font-semibold text-white flex-1 truncate">{p.name}</span>
                      <span className="text-[10px] text-gray-500">#{p.number}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 border-t border-gray-800 flex gap-2">
                <button
                  onClick={() => { setReplaceParticipant(null); setReplaceWith(null) }}
                  className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={doReplaceParticipant}
                  disabled={!replaceWith || !!loading}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {loading?.startsWith("replace") ? <RefreshCw size={14} className="animate-spin" /> : <Shuffle size={14} />}
                  تأكيد الاستبدال الكامل
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {/* TAB: ATTENDANCE ─────────────────────────────────────────────── */}
      {activeTab === "attendance" && (() => {
        const attended = attendanceData.filter((p: any) => p.attended).length
        const filtered = attendanceData.filter((p: any) => {
          if (!attendanceSearch.trim()) return true
          const q = attendanceSearch.trim().toLowerCase()
          return (p.name || "").toLowerCase().includes(q) || String(p.number).includes(q)
        })
        const getMatchName = (num: number) => attendanceData.find((p: any) => p.number === num)
        return (
          <div className="space-y-4">
            {/* Header */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} className="text-purple-400" />
                  <h2 className="text-sm font-bold text-white">قائمة الحضور</h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-lg font-bold tabular-nums">
                      <span className="text-purple-400">{attended}</span>
                      <span className="text-gray-600">/</span>
                      <span className="text-gray-400">{attendanceData.length}</span>
                    </span>
                    <span className="text-[10px] text-gray-600 mr-2">حاضر</span>
                  </div>
                  <button
                    onClick={fetchAttendance}
                    disabled={attendanceLoading}
                    className="w-9 h-9 rounded-xl bg-gray-800 border border-gray-700 hover:border-purple-600/30 flex items-center justify-center transition-colors"
                  >
                    {attendanceLoading ? <Loader2 size={15} className="animate-spin text-gray-500" /> : <RefreshCw size={15} className="text-gray-400" />}
                  </button>
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-3 h-1 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                  style={{ width: `${attendanceData.length > 0 ? (attended / attendanceData.length) * 100 : 0}%` }}
                />
              </div>
              {/* Search */}
              <div className="mt-3 relative">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  type="text"
                  value={attendanceSearch}
                  onChange={e => setAttendanceSearch(e.target.value)}
                  placeholder="بحث بالاسم أو الرقم..."
                  className="w-full bg-gray-950/80 border border-gray-800 focus:border-purple-600/40 rounded-lg py-2 pr-9 pl-3 text-sm text-white placeholder-gray-600 outline-none transition-colors"
                />
              </div>
            </div>

            {/* List */}
            {attendanceLoading && attendanceData.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-gray-600" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-600 text-sm">لا يوجد مشاركون</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((p: any) => {
                  const match = p.matched_with ? getMatchName(p.matched_with) : null
                  return (
                    <button
                      key={p.number}
                      onClick={() => toggleAttendance(p)}
                      disabled={attendanceToggling[p.number]}
                      className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-xl border transition-all text-right ${
                        p.attended
                          ? "bg-purple-900/20 border-purple-700/30 hover:bg-purple-900/30"
                          : "bg-gray-900/60 border-gray-800/60 hover:bg-gray-900/80"
                      }`}
                    >
                      <div className="flex-shrink-0">
                        {attendanceToggling[p.number] ? (
                          <Loader2 size={20} className="animate-spin text-gray-500" />
                        ) : p.attended ? (
                          <CheckCircle size={20} className="text-purple-400" />
                        ) : (
                          <Circle size={20} className="text-gray-700" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold text-sm truncate ${p.attended ? "text-purple-200" : "text-white"}`}>{p.name}</span>
                          <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">#{p.number}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.gender && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                              p.gender === "female" || p.gender === "أنثى" || p.gender === "أُنثَى"
                                ? "bg-pink-900/40 text-pink-300"
                                : "bg-blue-900/40 text-blue-300"
                            }`}>
                              {p.gender === "female" || p.gender === "أنثى" || p.gender === "أُنثَى" ? "♀" : "♂"}
                            </span>
                          )}
                          {p.age && <span className="text-[10px] text-gray-600">{p.age}y</span>}
                          {match && (
                            <span className="text-[10px] text-gray-500 truncate">
                              ↔ {match.name} #{match.number}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <span className={`text-[10px] font-semibold ${p.attended ? "text-purple-400" : "text-gray-600"}`}>
                          {p.attended ? "حاضر" : "غائب"}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* TAB: AI WELCOME ─────────────────────────────────────────────── */}
      {activeTab === "aiwelcome" && (() => {
        const generated = aiWelcomeData.filter((p: any) => p.has_welcome).length
        const missing = aiWelcomeData.length - generated
        const filtered = aiWelcomeData.filter((p: any) => {
          if (aiWelcomeFilter === "generated" && !p.has_welcome) return false
          if (aiWelcomeFilter === "missing" && p.has_welcome) return false
          if (aiWelcomeSearch.trim()) {
            const q = aiWelcomeSearch.trim().toLowerCase()
            return p.name.toLowerCase().includes(q) || String(p.number).includes(q)
          }
          return true
        })

        const toggleSelect = (num: number) => {
          setAiWelcomeSelected(prev => {
            const next = new Set(prev)
            if (next.has(num)) next.delete(num)
            else next.add(num)
            return next
          })
        }

        const generateBatch = async (regenerate: boolean = false) => {
          const nums = regenerate
            ? Array.from(aiWelcomeSelected)
            : Array.from(aiWelcomeSelected).filter(n => !aiWelcomeData.find(p => p.number === n)?.has_welcome)
          if (nums.length === 0) {
            toast.error(regenerate ? "اختر مشاركين لإعادة التوليد" : "لا يوجد مشاركين جدد — استخدم إعادة التوليد")
            return
          }
          setAiWelcomeGenerating(true)
          setAiWelcomeProgress({ done: 0, total: nums.length })
          // Process in chunks of 3 to avoid timeouts
          const chunkSize = 3
          for (let i = 0; i < nums.length; i += chunkSize) {
            const chunk = nums.slice(i, i + chunkSize)
            try {
              const data = await api("e3-ai-welcome-generate", { participant_numbers: chunk, regenerate })
              if (data.results) {
                for (const r of data.results) {
                  if (r.status === "generated" || r.status === "cached") {
                    setAiWelcomeData(prev => prev.map(p => p.number === r.number ? { ...p, has_welcome: true, welcome: r.welcome } : p))
                  }
                }
              }
            } catch (e) {
              console.error("Batch generate error:", e)
            }
            setAiWelcomeProgress({ done: Math.min(i + chunkSize, nums.length), total: nums.length })
          }
          setAiWelcomeGenerating(false)
          setAiWelcomeProgress(null)
          setAiWelcomeSelected(new Set())
          toast.success(`تم توليد ${nums.length} رسالة ترحيب`)
        }

        const generateAll = async (regenerate: boolean = false) => {
          const nums = regenerate
            ? aiWelcomeData.map(p => p.number)
            : aiWelcomeData.filter(p => !p.has_welcome).map(p => p.number)
          if (nums.length === 0) {
            toast.error(regenerate ? "لا يوجد مشاركين" : "جميع المشاركين لديهم رسائل بالفعل")
            return
          }
          setAiWelcomeGenerating(true)
          setAiWelcomeProgress({ done: 0, total: nums.length })
          const chunkSize = 3
          for (let i = 0; i < nums.length; i += chunkSize) {
            const chunk = nums.slice(i, i + chunkSize)
            try {
              const data = await api("e3-ai-welcome-generate", { participant_numbers: chunk, regenerate })
              if (data.results) {
                for (const r of data.results) {
                  if (r.status === "generated" || r.status === "cached") {
                    setAiWelcomeData(prev => prev.map(p => p.number === r.number ? { ...p, has_welcome: true, welcome: r.welcome } : p))
                  }
                }
              }
            } catch (e) {
              console.error("Batch generate error:", e)
            }
            setAiWelcomeProgress({ done: Math.min(i + chunkSize, nums.length), total: nums.length })
          }
          setAiWelcomeGenerating(false)
          setAiWelcomeProgress(null)
          toast.success(`تم توليد ${nums.length} رسالة ترحيب`)
        }

        const deleteWelcome = async (num: number) => {
          const data = await api("e3-ai-welcome-delete", { participant_number: num })
          if (data.success) {
            setAiWelcomeData(prev => prev.map(p => p.number === num ? { ...p, has_welcome: false, welcome: null } : p))
            toast.success("تم حذف الرسالة")
          }
        }

        return (
          <div className="space-y-4">
            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-white">{aiWelcomeData.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">إجمالي المشاركين</p>
              </div>
              <div className="bg-green-900/20 border border-green-800/40 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-400">{generated}</p>
                <p className="text-xs text-green-500/70 mt-0.5">رسائل مولّدة</p>
              </div>
              <div className="bg-orange-900/20 border border-orange-800/40 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-orange-400">{missing}</p>
                <p className="text-xs text-orange-500/70 mt-0.5">بانتظار التوليد</p>
              </div>
            </div>

            {/* Action bar */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => generateAll(false)}
                  disabled={aiWelcomeGenerating || missing === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold disabled:opacity-40 transition-colors"
                >
                  <Sparkles size={16} />
                  توليد للجميع ({missing})
                </button>
                <button
                  onClick={() => generateAll(true)}
                  disabled={aiWelcomeGenerating || aiWelcomeData.length === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-sm font-bold disabled:opacity-40 transition-colors"
                >
                  <RefreshCw size={16} />
                  إعادة توليد الكل
                </button>
                {aiWelcomeSelected.size > 0 && (
                  <>
                    <button
                      onClick={() => generateBatch(false)}
                      disabled={aiWelcomeGenerating}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold disabled:opacity-40 transition-colors"
                    >
                      <Sparkles size={16} />
                      توليد للمختارين ({aiWelcomeSelected.size})
                    </button>
                    <button
                      onClick={() => generateBatch(true)}
                      disabled={aiWelcomeGenerating}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-sm font-bold disabled:opacity-40 transition-colors"
                    >
                      <RefreshCw size={16} />
                      إعادة توليد للمختارين
                    </button>
                    <button
                      onClick={() => setAiWelcomeSelected(new Set())}
                      className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm transition-colors"
                    >
                      إلغاء التحديد
                    </button>
                  </>
                )}
                <button
                  onClick={fetchAiWelcome}
                  disabled={aiWelcomeLoading}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm transition-colors ml-auto"
                >
                  <RefreshCw size={14} className={aiWelcomeLoading ? "animate-spin" : ""} />
                  تحديث
                </button>
              </div>

              {/* Progress bar */}
              {aiWelcomeGenerating && aiWelcomeProgress && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-purple-400 font-medium">جاري التوليد...</span>
                    <span className="text-gray-500">{aiWelcomeProgress.done} / {aiWelcomeProgress.total}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-300"
                      style={{ width: `${(aiWelcomeProgress.done / aiWelcomeProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Search & filter */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={aiWelcomeSearch}
                    onChange={e => setAiWelcomeSearch(e.target.value)}
                    placeholder="بحث بالاسم أو الرقم..."
                    className="w-full bg-gray-800 text-white text-sm rounded-lg pr-9 pl-3 py-2 border border-gray-700 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div className="flex gap-1">
                  {[
                    { id: "all", label: "الكل" },
                    { id: "generated", label: "مولّدة" },
                    { id: "missing", label: "غير مولّدة" },
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setAiWelcomeFilter(f.id as any)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        aiWelcomeFilter === f.id
                          ? "bg-purple-600 text-white"
                          : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Participants list */}
            {aiWelcomeLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-purple-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">
                {aiWelcomeData.length === 0 ? "لا يوجد مشاركين في هذه الفعالية" : "لا نتائج مطابقة"}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((p: any) => (
                  <div
                    key={p.number}
                    className={`bg-gray-900 border rounded-xl p-3 flex items-center gap-3 transition-colors ${
                      aiWelcomeSelected.has(p.number) ? "border-purple-600/50 bg-purple-950/20" : "border-gray-800"
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelect(p.number)}
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        aiWelcomeSelected.has(p.number)
                          ? "bg-purple-600 border-purple-500"
                          : "bg-gray-800 border-gray-600 hover:border-gray-500"
                      }`}
                    >
                      {aiWelcomeSelected.has(p.number) && <Check size={12} className="text-white" />}
                    </button>

                    {/* Participant info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-500">#{p.number}</span>
                        <span className="text-sm text-white font-medium truncate">{p.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${p.gender === "female" ? "bg-pink-500/20 text-pink-400" : "bg-blue-500/20 text-blue-400"}`}>
                          {p.gender === "female" ? "♀" : "♂"}
                        </span>
                      </div>
                      {p.has_welcome ? (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed" dir="rtl">{p.welcome}</p>
                      ) : (
                        <p className="text-xs text-gray-600 mt-1 italic">لا توجد رسالة بعد</p>
                      )}
                    </div>

                    {/* Status badge */}
                    <div className="shrink-0">
                      {p.has_welcome ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-600/30">
                          <CheckCircle size={10} /> جاهزة
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-orange-500/15 text-orange-400 border border-orange-600/30">
                          <AlertCircle size={10} /> بانتظار
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {p.has_welcome && (
                        <button
                          onClick={() => setAiWelcomePreview(p)}
                          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-purple-400 transition-colors"
                          title="عرض الرسالة"
                        >
                          <Eye size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => generateBatch(false)}
                        disabled={aiWelcomeGenerating || (p.has_welcome && !aiWelcomeSelected.has(p.number))}
                        className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-purple-400 transition-colors disabled:opacity-30"
                        title="توليد"
                        onClickCapture={() => { if (!aiWelcomeSelected.has(p.number)) toggleSelect(p.number) }}
                      >
                        <Sparkles size={14} />
                      </button>
                      {p.has_welcome && (
                        <button
                          onClick={() => deleteWelcome(p.number)}
                          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors"
                          title="حذف"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* AI Welcome Preview Modal */}
      {aiWelcomePreview && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setAiWelcomePreview(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                  <Sparkles size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">رسالة ترحيب — #{aiWelcomePreview.number}</p>
                  <p className="text-gray-400 text-xs">{aiWelcomePreview.name}</p>
                </div>
              </div>
              <button onClick={() => setAiWelcomePreview(null)} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <div className="bg-gradient-to-b from-gray-800/50 to-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-gray-100 text-sm leading-[2.2] text-center whitespace-pre-wrap font-medium">{aiWelcomePreview.welcome}</p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-800 flex gap-2">
              <button
                onClick={() => { navigator.clipboard.writeText(aiWelcomePreview.welcome); toast.success("تم نسخ الرسالة") }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors"
              >
                <Copy size={14} /> نسخ
              </button>
              <button
                onClick={async () => {
                  setAiWelcomePreview(null)
                  setAiWelcomeSelected(new Set([aiWelcomePreview.number]))
                  // Trigger regenerate for this single participant
                  setAiWelcomeGenerating(true)
                  setAiWelcomeProgress({ done: 0, total: 1 })
                  try {
                    const data = await api("e3-ai-welcome-generate", { participant_numbers: [aiWelcomePreview.number], regenerate: true })
                    if (data.results) {
                      for (const r of data.results) {
                        if (r.status === "generated") {
                          setAiWelcomeData(prev => prev.map(p => p.number === r.number ? { ...p, has_welcome: true, welcome: r.welcome } : p))
                        }
                      }
                    }
                    toast.success("تم إعادة التوليد")
                  } catch { toast.error("فشل إعادة التوليد") }
                  setAiWelcomeGenerating(false)
                  setAiWelcomeProgress(null)
                  setAiWelcomeSelected(new Set())
                }}
                disabled={aiWelcomeGenerating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-sm font-bold transition-colors disabled:opacity-40"
              >
                <RefreshCw size={14} /> إعادة توليد
              </button>
              <button
                onClick={() => setAiWelcomePreview(null)}
                className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for mood check / notification sending */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmModal(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${confirmModal.type === "mood" ? "bg-purple-600/20" : "bg-blue-600/20"}`}>
                {confirmModal.type === "mood" ? <Heart size={20} className="text-purple-400" /> : <Bell size={20} className="text-blue-400" />}
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">
                  {confirmModal.type === "mood" ? "تأكيد إرسال فحص المزاج" : "تأكيد إرسال الإشعار"}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  سيتم الإرسال إلى: <span className="text-amber-400 font-semibold">{confirmModal.target}</span>
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {confirmModal.type === "mood"
                ? "هل أنت متأكد من إرسال فحص المزاج؟ لا يمكن التراجع عن هذا الإجراء."
                : "هل أنت متأكد من إرسال هذا الإشعار؟ لا يمكن التراجع عن هذا الإجراء."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={async () => { const fn = confirmModal.onConfirm; setConfirmModal(null); await fn() }}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${confirmModal.type === "mood" ? "bg-purple-600 hover:bg-purple-500" : "bg-blue-600 hover:bg-blue-500"}`}
              >
                <Send size={14} />
                تأكيد الإرسال
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
