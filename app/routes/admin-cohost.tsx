import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Circle,
  Clock3,
  Heart,
  Headphones,
  LayoutDashboard,
  ListOrdered,
  Loader2,
  Lock,
  LockKeyhole,
  LogOut,
  MapPin,
  Megaphone,
  MessageCircle,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Table2,
  TestTube2,
  UserCheck,
  Users,
  Wifi,
  ChevronDown,
  ChevronUp,
  Pencil,
  X,
  type LucideIcon,
} from "lucide-react"

const API = "/api/admin"
const SESSION_KEY = "event3_cohost_token"

type CohostTab = "home" | "people" | "rankings" | "tables" | "feedback" | "support" | "messages"
type RankingFilter = "all" | "submitted" | "pending"
type MoodAudience = "person" | "table" | "all_tables"
type FeedbackKind = "group" | "individual"
type FeedbackFilter = "missing" | "submitted" | "all"

interface CohostParticipant {
  number: number
  name: string
  age: number | null
  attended: boolean
  previous_event_count: number
  first_time: boolean
  ranking_submitted: boolean
  tables: Record<string, number>
  phase2_partner: number | null
  phase3_partner: number | null
  phase3_locked?: boolean
  phase3_source?: "test" | "locked" | "generated" | null
}

interface SosRequest {
  id: string
  participant_number: number
  participant_name: string | null
  table_info: string | null
  message: string | null
  organizer_reply: string | null
  status: string
  request_type: string | null
  created_at: string
  updated_at: string
}

interface LockedPair {
  participant1_number: number
  participant1_name: string
  participant2_number: number
  participant2_name: string
  compatibility_score: number | null
  table_number: number | null
  reason: string | null
  source: "test" | "locked"
  locked: boolean
  is_test_mode: boolean
}

interface CohostDashboard {
  event_id: number
  test_mode?: boolean
  state: {
    phase: string
    global_timer_active: boolean
    global_timer_start_time: string | null
    global_timer_duration: number | null
    global_timer_round: number | null
    test_mode_active?: boolean
  }
  participants: CohostParticipant[]
  sos_requests: SosRequest[]
  locked_phase3_pairs?: LockedPair[]
}

interface CohostRankingItem {
  number: number
  name: string
  rank: number
}

interface CohostRanking {
  number: number
  name: string
  submitted: boolean
  auto_saved: boolean
  count: number
  ranked_list: CohostRankingItem[]
}

interface CohostRankingsResponse {
  event_id: number
  rankings: CohostRanking[]
}

interface GroupFeedbackSubmission {
  reviewer_number: number
  reviewer_name: string
  member_number: number
  member_name: string
  experience: string | null
  tags: string[]
  organizer_note: string | null
  group_round: number
  updated_at: string
}

interface GroupFeedbackResponse {
  test_mode?: boolean
  reviewer_count: number
  submissions: GroupFeedbackSubmission[]
}

interface MatchFeedbackEntry {
  participant_number: number
  participant_name: string
  partner_number: number
  partner_name: string
  feedback: Record<string, unknown> | null
  submitted: boolean
  partner_submitted: boolean
  mutual_yes?: boolean
  compat_score?: number | null
}

interface MatchFeedbackResponse {
  phase2: MatchFeedbackEntry[]
  phase3: MatchFeedbackEntry[]
  phase2_submitted: number
  phase3_submitted: number
  total_participants: number
}

interface MoodCheckGroup {
  check_id: string
  triggered_at: string
  entries: Array<{
    participant_number: number
    participant_name: string
    mood: string | null
    answered_at: string | null
  }>
}

interface NotificationGroup {
  notif_id: string
  title: string
  body: string | null
  icon: string
  created_at: string
  entries: Array<{
    participant_number: number
    participant_name: string
    seen_at: string | null
  }>
}

interface LiveData {
  groupFeedback: GroupFeedbackResponse
  matchFeedback: MatchFeedbackResponse
  moodChecks: MoodCheckGroup[]
  notifications: NotificationGroup[]
}

interface PairView {
  a: number
  aName: string
  b: number
  bName: string
  table: number | null
  score?: number | null
  source?: "test" | "locked" | "generated" | null
}

const EMPTY_LIVE_DATA: LiveData = {
  groupFeedback: { reviewer_count: 0, submissions: [] },
  matchFeedback: { phase2: [], phase3: [], phase2_submitted: 0, phase3_submitted: 0, total_participants: 0 },
  moodChecks: [],
  notifications: [],
}

const PHASE_LABELS: Record<string, string> = {
  setup: "التجهيز",
  round1: "الجلسة الجماعية الأولى",
  ranking1: "ترتيب الجولة الأولى",
  round2: "الجلسة الجماعية الثانية",
  ranking2: "الترتيب النهائي",
  phase2_processing: "تجهيز اختيارات المشاركين",
  break: "استراحة",
  phase2_reveal: "لقاء الاختيار",
  phase3_reveal: "لقاء الخوارزمية",
  final_reveal: "النتائج النهائية",
}

const ROUND_LABELS: Record<number, string> = {
  1: "الجلسة الجماعية ١",
  2: "الجلسة الجماعية ٢",
  3: "الجلسة الجماعية ٣",
  20: "لقاءات الاختيار",
  30: "لقاءات الخوارزمية",
}

function activeRound(phase?: string) {
  if (phase === "round1") return 1
  if (phase === "round2") return 2
  if (phase === "phase2_reveal") return 20
  if (phase === "phase3_reveal") return 30
  return null
}

function rankingLocationRound(phase?: string) {
  if (phase === "round1" || phase === "ranking1") return 1
  if (phase === "round2" || phase === "ranking2") return 2
  if (phase === "phase2_processing" || phase === "break" || phase === "phase2_reveal") return 20
  if (phase === "phase3_processing" || phase === "phase3_reveal" || phase === "final_reveal") return 30
  return null
}

function formatTimer(seconds: number) {
  const safe = Math.max(0, seconds)
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`
}

function formatTime(value?: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

function pairKey(a: number, b: number) {
  return `${Math.min(a, b)}-${Math.max(a, b)}`
}

const PHASE_ORDER = [
  "setup",
  "round1",
  "ranking1",
  "round2",
  "ranking2",
  "phase2_processing",
  "break",
  "phase2_reveal",
  "phase3_processing",
  "phase3_reveal",
  "final_reveal",
]

function phaseReached(currentPhase: string | undefined, targetPhase: string) {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase || "")
  const targetIndex = PHASE_ORDER.indexOf(targetPhase)
  return currentIndex >= targetIndex && targetIndex >= 0
}

function experienceLabel(value?: string | null) {
  return ({
    great: "ممتاز",
    good: "جيد",
    neutral: "عادي",
    uncomfortable: "غير مريح",
  } as Record<string, string>)[value || ""] || value || "بدون وصف"
}

function feedbackMetric(feedback: Record<string, unknown> | null, key: string) {
  const value = feedback?.[key]
  return typeof value === "number" || typeof value === "string" ? String(value) : null
}

async function cohostApi<T>(action: string, token: string, extra: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...extra }),
  })
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) throw new Error("تعذر الوصول إلى خدمة الفعالية")
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.success === false) {
    const error = new Error(data?.error || "تعذر تنفيذ الطلب") as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return data as T
}

function SectionTitle({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-400/10 text-teal-300"><Icon size={17} /></span>
        <div>
          <h2 className="text-sm font-black text-white">{title}</h2>
          {detail ? <p className="mt-0.5 text-[11px] leading-5 text-slate-400">{detail}</p> : null}
        </div>
      </div>
    </div>
  )
}

export default function AdminCohostPage() {
  const [initialized, setInitialized] = useState(false)
  const [token, setToken] = useState("")
  const [password, setPassword] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [dashboard, setDashboard] = useState<CohostDashboard | null>(null)
  const [liveData, setLiveData] = useState<LiveData>(EMPTY_LIVE_DATA)
  const [loading, setLoading] = useState(false)
  const [liveLoading, setLiveLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<CohostTab>("home")
  const [toggling, setToggling] = useState<Record<number, boolean>>({})
  const [sosBusy, setSosBusy] = useState<Record<string, boolean>>({})
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [timerRemaining, setTimerRemaining] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [messageTarget, setMessageTarget] = useState("")
  const [notificationTitle, setNotificationTitle] = useState("")
  const [messageBody, setMessageBody] = useState("")
  const [messageBusy, setMessageBusy] = useState(false)
  const [moodAudience, setMoodAudience] = useState<MoodAudience>("table")
  const [moodParticipant, setMoodParticipant] = useState("")
  const [moodTable, setMoodTable] = useState("")
  const [rankings, setRankings] = useState<CohostRanking[]>([])
  const [rankingsLoading, setRankingsLoading] = useState(false)
  const [rankingSearch, setRankingSearch] = useState("")
  const [rankingFilter, setRankingFilter] = useState<RankingFilter>("all")
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>("group")
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>("missing")
  const [feedbackSearch, setFeedbackSearch] = useState("")
  const [feedbackUpdated, setFeedbackUpdated] = useState<Date | null>(null)
  const [editingRanker, setEditingRanker] = useState<number | null>(null)
  const [rankingDraft, setRankingDraft] = useState<CohostRankingItem[]>([])
  const [rankingSaving, setRankingSaving] = useState(false)
  const dashboardRequest = useRef(0)
  const feedbackRequest = useRef(0)
  const operationsRequest = useRef(0)

  useEffect(() => {
    setToken(sessionStorage.getItem(SESSION_KEY) || "")
    setInitialized(true)
  }, [])

  const logout = useCallback((message = "") => {
    sessionStorage.removeItem(SESSION_KEY)
    localStorage.removeItem("cohost_auth")
    setToken("")
    setDashboard(null)
    setLiveData(EMPTY_LIVE_DATA)
    setRankings([])
    setEditingRanker(null)
    setRankingDraft([])
    setError(message)
  }, [])

  const handleRequestError = useCallback((requestError: unknown, fallback: string) => {
    const status = (requestError as Error & { status?: number })?.status
    if (status === 401 || status === 403) {
      logout("انتهت جلسة رنيم. سجّلي الدخول مرة أخرى.")
      return
    }
    setError(requestError instanceof Error ? requestError.message : fallback)
  }, [logout])

  const fetchDashboard = useCallback(async (quiet = false) => {
    if (!token) return
    const requestId = ++dashboardRequest.current
    if (!quiet) setLoading(true)
    try {
      const data = await cohostApi<CohostDashboard>("e3-cohost-dashboard", token)
      if (requestId !== dashboardRequest.current) return
      setDashboard(data)
      setLastUpdated(new Date())
      setError("")
    } catch (requestError) {
      if (requestId === dashboardRequest.current) handleRequestError(requestError, "تعذر تحميل الفعالية")
    } finally {
      if (!quiet && requestId === dashboardRequest.current) setLoading(false)
    }
  }, [handleRequestError, token])

  const fetchRankings = useCallback(async (quiet = false) => {
    if (!token) return
    if (!quiet) setRankingsLoading(true)
    try {
      const data = await cohostApi<CohostRankingsResponse>("e3-cohost-rankings", token)
      setRankings(data.rankings || [])
      setError("")
    } catch (requestError) {
      if (!quiet) handleRequestError(requestError, "تعذر تحميل التصنيفات")
    } finally {
      if (!quiet) setRankingsLoading(false)
    }
  }, [handleRequestError, token])

  const fetchFeedbackData = useCallback(async (quiet = false) => {
    if (!token) return
    const requestId = ++feedbackRequest.current
    if (!quiet) setLiveLoading(true)
    const results = await Promise.allSettled([
      cohostApi<GroupFeedbackResponse>("e3-get-group-member-feedback", token),
      cohostApi<MatchFeedbackResponse>("e3-get-feedback", token),
    ])
    if (requestId !== feedbackRequest.current) {
      if (!quiet) setLiveLoading(false)
      return
    }
    setLiveData(previous => ({
      groupFeedback: results[0].status === "fulfilled" ? results[0].value : previous.groupFeedback,
      matchFeedback: results[1].status === "fulfilled" ? results[1].value : previous.matchFeedback,
      moodChecks: previous.moodChecks,
      notifications: previous.notifications,
    }))
    if (results.some(result => result.status === "fulfilled")) setFeedbackUpdated(new Date())
    const rejected = results.find(result => result.status === "rejected")
    if (rejected?.status === "rejected" && !quiet) handleRequestError(rejected.reason, "تعذر تحميل التقييمات")
    if (!quiet) setLiveLoading(false)
  }, [handleRequestError, token])

  const fetchOperationsData = useCallback(async (quiet = false) => {
    if (!token) return
    const requestId = ++operationsRequest.current
    if (!quiet) setLiveLoading(true)
    const results = await Promise.allSettled([
      cohostApi<{ checks: MoodCheckGroup[] }>("e3-get-mood-checks", token),
      cohostApi<{ notifications: NotificationGroup[] }>("e3-get-notifications", token),
    ])
    if (requestId !== operationsRequest.current) {
      if (!quiet) setLiveLoading(false)
      return
    }
    setLiveData(previous => ({
      groupFeedback: previous.groupFeedback,
      matchFeedback: previous.matchFeedback,
      moodChecks: results[0].status === "fulfilled" ? results[0].value.checks || [] : previous.moodChecks,
      notifications: results[1].status === "fulfilled" ? results[1].value.notifications || [] : previous.notifications,
    }))
    const rejected = results.find(result => result.status === "rejected")
    if (rejected?.status === "rejected" && !quiet) handleRequestError(rejected.reason, "تعذر تحميل المتابعة المباشرة")
    if (!quiet) setLiveLoading(false)
  }, [handleRequestError, token])

  useEffect(() => {
    if (!token) return
    fetchDashboard()
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchDashboard(true)
    }, 6000)
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchDashboard(true)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [fetchDashboard, token])

  useEffect(() => {
    if (!token || (tab !== "home" && tab !== "feedback")) return
    fetchFeedbackData()
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchFeedbackData(true)
    }, tab === "feedback" ? 8000 : 15000)
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchFeedbackData(true)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [fetchFeedbackData, tab, token])

  useEffect(() => {
    if (!token || (tab !== "support" && tab !== "messages")) return
    fetchOperationsData()
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchOperationsData(true)
    }, 10000)
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchOperationsData(true)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [fetchOperationsData, tab, token])

  useEffect(() => {
    if (!token || tab !== "rankings" || editingRanker !== null) return
    fetchRankings()
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchRankings(true)
    }, 10000)
    return () => window.clearInterval(interval)
  }, [editingRanker, fetchRankings, tab, token])

  useEffect(() => {
    const state = dashboard?.state
    if (!state?.global_timer_active || !state.global_timer_start_time) {
      setTimerRemaining(0)
      return
    }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(state.global_timer_start_time as string).getTime()) / 1000)
      setTimerRemaining(Math.max(0, Number(state.global_timer_duration || 0) - elapsed))
    }
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [dashboard?.state])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (!password.trim()) return
    setLoginLoading(true)
    setError("")
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "e3-cohost-login", password }),
      })
      const contentType = response.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) throw new Error("تعذر الوصول إلى خدمة الفعالية")
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.token) {
        if (data.code === "COHOST_NOT_CONFIGURED") {
          throw new Error("إعداد دخول المضيفة غير مكتمل في النسخة المنشورة. تأكد من متغير Vercel ثم أعد النشر.")
        }
        throw new Error(data.error || "كلمة المرور غير صحيحة")
      }
      sessionStorage.setItem(SESSION_KEY, data.token)
      setToken(data.token)
      setPassword("")
    } catch (loginError) {
      setError(loginError instanceof Error && loginError.message !== "Unauthorized" ? loginError.message : "كلمة المرور غير صحيحة")
    } finally {
      setLoginLoading(false)
    }
  }

  const participants = dashboard?.participants || []
  const participantByNumber = useMemo(() => new Map(participants.map(participant => [Number(participant.number), participant])), [participants])
  const round = activeRound(dashboard?.state.phase)
  const testMode = dashboard?.test_mode === true || dashboard?.state.test_mode_active === true
  const attendedCount = participants.filter(participant => participant.attended).length
  const rankingCount = participants.filter(participant => participant.ranking_submitted).length
  const submittedRankingsCount = rankings.filter(ranking => ranking.submitted).length
  const pendingRankingsCount = rankings.length - submittedRankingsCount
  const filteredRankings = useMemo(() => {
    const query = rankingSearch.trim().toLowerCase()
    return rankings
      .filter(ranking => rankingFilter === "all" || (rankingFilter === "submitted" ? ranking.submitted : !ranking.submitted))
      .filter(ranking => !query || ranking.name.toLowerCase().includes(query) || String(ranking.number).includes(query))
      .sort((left, right) => Number(left.submitted) - Number(right.submitted) || left.number - right.number)
  }, [rankingFilter, rankingSearch, rankings])
  const rankingTableBadges = (participantNumber: number) => {
    const tables = participantByNumber.get(Number(participantNumber))?.tables || {}
    const liveRound = rankingLocationRound(dashboard?.state.phase)
    const liveTable = liveRound != null ? tables[String(liveRound)] : null
    if (liveTable != null) return [{ key: `live-${liveRound}`, label: `طاولة ${liveTable}`, live: true }]
    return [1, 2]
      .filter(tableRound => tables[String(tableRound)] != null)
      .map(tableRound => ({ key: `group-${tableRound}`, label: `ج${tableRound} · طاولة ${tables[String(tableRound)]}`, live: false }))
  }
  const filteredParticipants = useMemo(() => {
    const query = search.trim().toLowerCase()
    return participants
      .filter(participant => !query || participant.name.toLowerCase().includes(query) || String(participant.number).includes(query))
      .sort((left, right) => Number(left.attended) - Number(right.attended) || left.number - right.number)
  }, [participants, search])

  const tableGroups = useMemo(() => {
    const result: Record<number, Array<{ table: number; members: CohostParticipant[] }>> = {}
    for (const tableRound of [1, 2, 3, 20, 30]) {
      const tables = new Map<number, CohostParticipant[]>()
      for (const participant of participants) {
        const table = Number(participant.tables?.[String(tableRound)] || 0)
        if (!table) continue
        tables.set(table, [...(tables.get(table) || []), participant])
      }
      result[tableRound] = [...tables.entries()]
        .sort(([left], [right]) => left - right)
        .map(([table, members]) => ({ table, members }))
    }
    return result
  }, [participants])

  const groupFeedbackRounds = useMemo(() => {
    return ([1, 2] as const).map(groupRound => {
      const started = phaseReached(dashboard?.state.phase, groupRound === 1 ? "ranking1" : "ranking2")
      const groups = (tableGroups[groupRound] || []).map(group => {
        const members = group.members.map(participant => {
          const submissions = liveData.groupFeedback.submissions.filter(entry =>
            Number(entry.group_round) === groupRound
            && Number(entry.reviewer_number) === participant.number
          )
          const expectedCount = Math.max(0, group.members.length - 1)
          const reviewedCount = new Set(submissions.map(entry => Number(entry.member_number))).size
          const status = expectedCount === 0
            ? "not_applicable"
            : reviewedCount === 0
              ? "missing"
              : reviewedCount < expectedCount
                ? "partial"
                : "complete"
          return { participant, submissions, expectedCount, reviewedCount, status }
        })
        return {
          ...group,
          members,
          submittedCount: members.filter(member => member.status === "partial" || member.status === "complete").length,
          missingCount: members.filter(member => member.status === "missing").length,
        }
      })
      const members = groups.flatMap(group => group.members).filter(member => member.status !== "not_applicable")
      return {
        round: groupRound,
        label: ROUND_LABELS[groupRound],
        started,
        groups,
        expectedCount: members.length,
        submittedCount: members.filter(member => member.status === "partial" || member.status === "complete").length,
        completeCount: members.filter(member => member.status === "complete").length,
        partialCount: members.filter(member => member.status === "partial").length,
        missingCount: started ? members.filter(member => member.status === "missing").length : 0,
      }
    })
  }, [dashboard?.state.phase, liveData.groupFeedback.submissions, tableGroups])

  const individualFeedbackPhases = useMemo(() => {
    return ([
      { key: "phase2" as const, label: "لقاءات الاختيار", round: 20, targetPhase: "phase2_reveal", entries: liveData.matchFeedback.phase2 },
      { key: "phase3" as const, label: "لقاءات الخوارزمية", round: 30, targetPhase: "phase3_reveal", entries: liveData.matchFeedback.phase3 },
    ]).map(item => {
      const entryByParticipant = new Map(item.entries.map(entry => [Number(entry.participant_number), entry]))
      const seen = new Set<string>()
      const pairs = participants.flatMap(participant => {
        const partnerNumber = Number(item.key === "phase2" ? participant.phase2_partner : participant.phase3_partner)
        if (!partnerNumber) return []
        const partner = participantByNumber.get(partnerNumber)
        if (!partner) return []
        const key = pairKey(participant.number, partnerNumber)
        if (seen.has(key)) return []
        seen.add(key)
        const members = [participant, partner].map(person => ({
          participant: person,
          entry: entryByParticipant.get(person.number) || null,
          submitted: entryByParticipant.get(person.number)?.submitted === true,
        }))
        return [{
          key,
          table: Number(participant.tables?.[String(item.round)] || partner.tables?.[String(item.round)] || 0) || null,
          members,
          submittedCount: members.filter(member => member.submitted).length,
          missingCount: members.filter(member => !member.submitted).length,
        }]
      })
      const expectedCount = pairs.reduce((total, pair) => total + pair.members.length, 0)
      const submittedCount = pairs.reduce((total, pair) => total + pair.submittedCount, 0)
      const started = phaseReached(dashboard?.state.phase, item.targetPhase)
      return {
        ...item,
        started,
        pairs: pairs.sort((left, right) => (left.table || 999) - (right.table || 999)),
        expectedCount,
        submittedCount,
        missingCount: started ? Math.max(0, expectedCount - submittedCount) : 0,
      }
    })
  }, [dashboard?.state.phase, liveData.matchFeedback.phase2, liveData.matchFeedback.phase3, participantByNumber, participants])

  const activeGroupFeedbackRounds = groupFeedbackRounds.filter(item => item.started)
  const activeIndividualFeedbackPhases = individualFeedbackPhases.filter(item => item.started)
  const groupFeedbackExpected = activeGroupFeedbackRounds.reduce((total, item) => total + item.expectedCount, 0)
  const groupFeedbackSubmitted = activeGroupFeedbackRounds.reduce((total, item) => total + item.submittedCount, 0)
  const groupFeedbackMissing = activeGroupFeedbackRounds.reduce((total, item) => total + item.missingCount, 0)
  const groupFeedbackPartial = activeGroupFeedbackRounds.reduce((total, item) => total + item.partialCount, 0)
  const individualFeedbackExpected = activeIndividualFeedbackPhases.reduce((total, item) => total + item.expectedCount, 0)
  const individualFeedbackSubmitted = activeIndividualFeedbackPhases.reduce((total, item) => total + item.submittedCount, 0)
  const individualFeedbackMissing = activeIndividualFeedbackPhases.reduce((total, item) => total + item.missingCount, 0)
  const feedbackMissingTotal = groupFeedbackMissing + individualFeedbackMissing
  const normalizedFeedbackSearch = feedbackSearch.trim().toLowerCase()
  const feedbackPersonMatches = (number: number, name: string) => !normalizedFeedbackSearch
    || name.toLowerCase().includes(normalizedFeedbackSearch)
    || String(number).includes(normalizedFeedbackSearch)

  const moodRound = activeRound(dashboard?.state.phase)
  const activeMoodGroups = moodRound != null ? (tableGroups[moodRound] || []) : []
  const activeMoodParticipants = useMemo(() => {
    const seen = new Set<number>()
    return activeMoodGroups.flatMap(group => group.members).filter(participant => {
      if (seen.has(participant.number)) return false
      seen.add(participant.number)
      return true
    }).sort((left, right) => left.number - right.number)
  }, [activeMoodGroups])
  const selectedMoodTable = activeMoodGroups.some(group => String(group.table) === moodTable)
    ? moodTable
    : String(activeMoodGroups[0]?.table || "")
  const selectedMoodParticipant = activeMoodParticipants.some(participant => String(participant.number) === moodParticipant)
    ? moodParticipant
    : String(activeMoodParticipants[0]?.number || "")
  const selectedMoodGroup = activeMoodGroups.find(group => String(group.table) === selectedMoodTable) || null
  const activeMoodParticipantCount = activeMoodParticipants.length
  const canSendMoodCheck = moodRound != null
    && (moodAudience === "person" ? Boolean(selectedMoodParticipant) : moodAudience === "table" ? Boolean(selectedMoodTable) : activeMoodParticipantCount > 0)
  const moodTargetLabel = moodAudience === "person"
    ? `${participantByNumber.get(Number(selectedMoodParticipant))?.name || `#${selectedMoodParticipant}`} · طاولة ${participantByNumber.get(Number(selectedMoodParticipant))?.tables?.[String(moodRound)] || "—"}`
    : moodAudience === "table"
      ? `طاولة ${selectedMoodTable || "—"} (${selectedMoodGroup?.members.length || 0})`
      : `كل الطاولات النشطة (${activeMoodGroups.length} طاولات · ${activeMoodParticipantCount} مشاركين)`

  const phase2Pairs = useMemo<PairView[]>(() => {
    const seen = new Set<string>()
    const result: PairView[] = []
    for (const participant of participants) {
      const partnerNumber = Number(participant.phase2_partner || 0)
      const partner = participantByNumber.get(partnerNumber)
      if (!partner) continue
      const key = pairKey(participant.number, partnerNumber)
      if (seen.has(key)) continue
      seen.add(key)
      result.push({ a: participant.number, aName: participant.name, b: partner.number, bName: partner.name, table: participant.tables?.["20"] || partner.tables?.["20"] || null })
    }
    return result
  }, [participantByNumber, participants])

  const phase3Pairs = useMemo<PairView[]>(() => {
    const seen = new Set<string>()
    const result: PairView[] = []
    for (const pair of dashboard?.locked_phase3_pairs || []) {
      const key = pairKey(Number(pair.participant1_number), Number(pair.participant2_number))
      if (seen.has(key)) continue
      seen.add(key)
      result.push({
        a: Number(pair.participant1_number),
        aName: pair.participant1_name,
        b: Number(pair.participant2_number),
        bName: pair.participant2_name,
        table: pair.table_number,
        score: pair.compatibility_score,
        source: pair.source,
      })
    }
    for (const participant of participants) {
      const partnerNumber = Number(participant.phase3_partner || 0)
      const partner = participantByNumber.get(partnerNumber)
      if (!partner) continue
      const key = pairKey(participant.number, partnerNumber)
      if (seen.has(key)) continue
      seen.add(key)
      result.push({
        a: participant.number,
        aName: participant.name,
        b: partner.number,
        bName: partner.name,
        table: participant.tables?.["30"] || partner.tables?.["30"] || null,
        source: participant.phase3_source || partner.phase3_source,
      })
    }
    return result
  }, [dashboard?.locked_phase3_pairs, participantByNumber, participants])

  const startRankingEdit = (ranking: CohostRanking) => {
    if (!ranking.submitted || !ranking.ranked_list.length) return
    setEditingRanker(ranking.number)
    setRankingDraft(ranking.ranked_list.map(item => ({ ...item })))
  }

  const moveRankingItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= rankingDraft.length) return
    setRankingDraft(previous => {
      const next = [...previous]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return next.map((item, itemIndex) => ({ ...item, rank: itemIndex + 1 }))
    })
  }

  const saveRankingEdit = async () => {
    if (!token || editingRanker === null || rankingSaving) return
    const ranking = rankings.find(item => item.number === editingRanker)
    if (!ranking) return
    if (!window.confirm(`حفظ ترتيب ${ranking.name} بعد التعديل؟`)) return
    setRankingSaving(true)
    setError("")
    try {
      await cohostApi("e3-cohost-set-ranking", token, {
        ranker_number: editingRanker,
        ranked_list: rankingDraft.map(item => item.number),
      })
      setNotice(`تم تحديث ترتيب ${ranking.name}`)
      setEditingRanker(null)
      setRankingDraft([])
      await Promise.all([fetchRankings(true), fetchDashboard(true)])
    } catch (requestError) {
      handleRequestError(requestError, "تعذر حفظ التصنيف")
    } finally {
      setRankingSaving(false)
    }
  }

  const toggleAttendance = async (participant: CohostParticipant) => {
    if (!token || toggling[participant.number]) return
    const nextValue = !participant.attended
    setToggling(previous => ({ ...previous, [participant.number]: true }))
    setDashboard(previous => previous ? {
      ...previous,
      participants: previous.participants.map(item => item.number === participant.number ? { ...item, attended: nextValue } : item),
    } : previous)
    try {
      const data = await cohostApi<{ attended: boolean }>("e3-cohost-set-attendance", token, { participant_number: participant.number, attended: nextValue })
      setDashboard(previous => previous ? {
        ...previous,
        participants: previous.participants.map(item => item.number === participant.number ? { ...item, attended: !!data.attended } : item),
      } : previous)
      setNotice(nextValue ? `تم تسجيل حضور ${firstName(participant.name)}` : `تم إلغاء حضور ${firstName(participant.name)}`)
    } catch (requestError) {
      setDashboard(previous => previous ? {
        ...previous,
        participants: previous.participants.map(item => item.number === participant.number ? { ...item, attended: participant.attended } : item),
      } : previous)
      handleRequestError(requestError, "تعذر تحديث الحضور")
    } finally {
      setToggling(previous => { const next = { ...previous }; delete next[participant.number]; return next })
    }
  }

  const replySos = async (request: SosRequest) => {
    const reply = (replyText[request.id] || "").trim()
    if (!token || !reply || sosBusy[request.id]) return
    setSosBusy(previous => ({ ...previous, [request.id]: true }))
    try {
      await cohostApi("e3-cohost-reply-sos", token, { id: request.id, reply })
      setReplyText(previous => ({ ...previous, [request.id]: "" }))
      setNotice(`تم إرسال الرد إلى ${request.participant_name || `#${request.participant_number}`}`)
      await fetchDashboard(true)
    } catch (requestError) {
      handleRequestError(requestError, "تعذر إرسال الرد")
    } finally {
      setSosBusy(previous => { const next = { ...previous }; delete next[request.id]; return next })
    }
  }

  const resolveSos = async (request: SosRequest) => {
    if (!token || sosBusy[request.id]) return
    if (!window.confirm(`هل تم حل طلب ${request.participant_name || `#${request.participant_number}`}؟`)) return
    setSosBusy(previous => ({ ...previous, [request.id]: true }))
    try {
      await cohostApi("e3-cohost-resolve-sos", token, { id: request.id })
      setDashboard(previous => previous ? { ...previous, sos_requests: previous.sos_requests.filter(item => item.id !== request.id) } : previous)
      setNotice("تم إغلاق طلب المساعدة")
    } catch (requestError) {
      handleRequestError(requestError, "تعذر إغلاق الطلب")
    } finally {
      setSosBusy(previous => { const next = { ...previous }; delete next[request.id]; return next })
    }
  }

  const openParticipantMessage = (participant: CohostParticipant) => {
    setMessageTarget(String(participant.number))
    setNotificationTitle("رسالة من المنظم")
    setMessageBody(`مرحبًا ${firstName(participant.name)} 🤍\n\n`)
    setTab("messages")
  }

  const sendMessage = async () => {
    if (!token || messageBusy) return
    const targetNumber = messageTarget ? Number(messageTarget) : null
    if (!messageBody.trim()) {
      setError("اكتبي نص الرسالة أولًا")
      return
    }
    if (!notificationTitle.trim()) {
      setError("اكتبي عنوان التنبيه")
      return
    }
    if (!targetNumber) {
      if (!window.confirm(`سيصل هذا التنبيه إلى جميع المشاركين (${participants.length}). هل أنتِ متأكدة؟`)) return
    }
    setMessageBusy(true)
    setError("")
    try {
      const data = await cohostApi<{ sent_to: number }>("e3-send-notification", token, {
        target_number: targetNumber || undefined,
        title: notificationTitle.trim(),
        body: messageBody.trim(),
        icon: "info",
        confirm_all: !targetNumber,
      })
      setNotice(`تم إرسال التنبيه إلى ${data.sent_to} مشارك${data.sent_to === 1 ? "" : "ين"}`)
      setMessageBody("")
      setNotificationTitle("")
      await fetchOperationsData(true)
    } catch (requestError) {
      handleRequestError(requestError, "تعذر إرسال الرسالة")
    } finally {
      setMessageBusy(false)
    }
  }

  const sendMoodCheck = async () => {
    if (!token || messageBusy || !canSendMoodCheck || moodRound == null) return
    const targetNumber = moodAudience === "person" ? Number(selectedMoodParticipant) : null
    const targetTable = moodAudience === "table" ? Number(selectedMoodTable) : null
    if (!window.confirm(`إرسال سؤال الاطمئنان إلى ${moodTargetLabel}؟`)) return
    setMessageBusy(true)
    setError("")
    try {
      const data = await cohostApi<{ sent_to: number; skipped_pending?: number }>("e3-trigger-mood-check", token, {
        target_number: targetNumber || undefined,
        target_round: moodRound,
        target_table: targetTable || undefined,
        confirm_all: moodAudience !== "person",
      })
      setNotice(`تم إرسال سؤال الاطمئنان إلى ${data.sent_to} مشارك${data.sent_to === 1 ? "" : "ين"}${data.skipped_pending ? ` · تم تجاوز ${data.skipped_pending} لديهم سؤال بانتظار الرد` : ""}`)
      await fetchOperationsData(true)
    } catch (requestError) {
      handleRequestError(requestError, "تعذر إرسال سؤال الاطمئنان")
    } finally {
      setMessageBusy(false)
    }
  }

  if (!initialized) return <div className="min-h-screen bg-[#06090f]" />

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#06090f] p-5 text-white" dir="rtl">
        <div className="w-full max-w-sm rounded-[2rem] border border-teal-300/15 bg-gradient-to-b from-slate-900 to-[#080b12] p-6 shadow-2xl shadow-teal-950/30">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-teal-300/20 bg-teal-300/10">
            <Heart size={29} className="text-teal-300" />
          </div>
          <div className="mt-5 text-center">
            <p className="text-[11px] font-black tracking-[0.16em] text-teal-300">BLINDMATCH · EVENT 3</p>
            <h1 className="mt-2 text-2xl font-black">أهلًا رنيم 👋</h1>
            <p className="mt-2 text-sm leading-7 text-slate-300">هذه مساحتك لإدارة الحضور والجداول والمساعدة والرسائل بسهولة أثناء الفعالية.</p>
          </div>
          <form onSubmit={handleLogin} className="mt-7 space-y-3">
            <label htmlFor="cohost-password" className="block text-xs font-bold text-slate-300">كلمة مرور المضيفة</label>
            <div className="relative">
              <Lock size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="cohost-password"
                type="password"
                value={password}
                onChange={event => { setPassword(event.target.value); setError("") }}
                placeholder="اكتبي كلمة المرور"
                autoComplete="current-password"
                autoFocus
                className="min-h-12 w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-3 pr-10 text-sm outline-none transition placeholder:text-slate-600 focus:border-teal-300/50"
              />
            </div>
            {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-950/40 px-3 py-2 text-center text-xs leading-5 text-red-200">{error}</p> : null}
            <button type="submit" disabled={loginLoading || !password.trim()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-teal-400 to-cyan-400 font-black text-slate-950 transition active:scale-[0.99] disabled:opacity-40">
              {loginLoading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              دخول آمن
            </button>
          </form>
          <div className="mt-5 flex gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-[11px] leading-5 text-slate-400">
            <LockKeyhole size={16} className="mt-0.5 shrink-0 text-teal-300" />
            <p>لن تجدي هنا أي زر لتغيير المرحلة أو المؤقت أو تشغيل المطابقة. هذه الصلاحيات تبقى عند المضيف الأساسي.</p>
          </div>
        </div>
      </div>
    )
  }

  const tabs: Array<{ value: CohostTab; label: string; icon: LucideIcon; badge?: number; badgeTone?: "amber" | "red" }> = [
    { value: "home", label: "الرئيسية", icon: LayoutDashboard },
    { value: "people", label: "الحضور", icon: Users },
    { value: "rankings", label: "التصنيفات", icon: ListOrdered, badge: Math.max(0, participants.length - rankingCount), badgeTone: "amber" },
    { value: "tables", label: "الجداول", icon: Table2 },
    { value: "feedback", label: "التقييمات", icon: ClipboardCheck, badge: feedbackMissingTotal, badgeTone: "amber" },
    { value: "support", label: "المتابعة", icon: Headphones, badge: dashboard?.sos_requests.length || 0, badgeTone: "red" },
  ]

  return (
    <div className="min-h-screen bg-[#06090f] text-white" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#06090f]/95 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-teal-300/20 bg-teal-300/10">
                <ShieldCheck size={20} className="text-teal-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-sm font-black">لوحة رنيم · فعالية {dashboard?.event_id ?? "—"}</h1>
                  {testMode ? <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[9px] font-black text-amber-200">اختبار</span> : null}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold text-teal-300">
                  <Wifi size={11} />
                  <span>{PHASE_LABELS[dashboard?.state.phase || ""] || dashboard?.state.phase || "جاري الاتصال"}</span>
                  {lastUpdated ? <span className="font-normal text-slate-500">· تحديث {formatTime(lastUpdated.toISOString())}</span> : null}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {dashboard?.state.global_timer_active ? (
                <div className={`flex min-h-11 items-center gap-1.5 rounded-xl border px-2.5 font-mono text-xs font-black ${timerRemaining <= 60 ? "border-red-400/30 bg-red-950/40 text-red-200" : "border-white/10 bg-white/[0.04] text-slate-100"}`} title="عرض المؤقت فقط">
                  <Clock3 size={14} /> {formatTimer(timerRemaining)}
                </div>
              ) : null}
              <button onClick={() => setTab("messages")} aria-label="التواصل والاطمئنان" className={`relative flex h-11 w-11 items-center justify-center rounded-xl border text-slate-200 ${tab === "messages" ? "border-teal-300/30 bg-teal-300/12" : "border-white/10 bg-white/[0.04]"}`}>
                <MessageCircle size={17} />
              </button>
              <button onClick={() => fetchDashboard()} disabled={loading} aria-label="تحديث البيانات" className="hidden h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 disabled:opacity-50 sm:flex">
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              </button>
              <button onClick={() => logout()} aria-label="تسجيل الخروج" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 hover:text-red-200">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        {testMode ? (
          <div className="flex gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3 text-amber-100">
            <TestTube2 size={20} className="mt-0.5 shrink-0" />
            <div><p className="text-xs font-black">وضع الاختبار يعمل الآن</p><p className="mt-1 text-[11px] leading-5 text-amber-100/75">النتائج والطاولات المعروضة تجريبية ومعزولة عن الفعالية الفعلية.</p></div>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-400/25 bg-red-950/40 p-3 text-xs leading-5 text-red-100">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-300" /><span className="min-w-0 flex-1">{error}</span><button onClick={() => setError("")} aria-label="إغلاق الخطأ" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5"><X size={14} /></button>
          </div>
        ) : null}
        {notice ? (
          <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl border border-teal-300/25 bg-teal-950/40 p-3 text-xs text-teal-100">
            <CheckCircle2 size={18} className="shrink-0 text-teal-300" /><span className="min-w-0 flex-1">{notice}</span><button onClick={() => setNotice("")} aria-label="إغلاق التنبيه" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5"><X size={14} /></button>
          </div>
        ) : null}

        {loading && !dashboard ? (
          <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-slate-400"><Loader2 size={28} className="animate-spin text-teal-300" /><p className="text-sm">جاري تجهيز لوحة رنيم…</p></div>
        ) : tab === "home" ? (
          <>
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "الحاضرين", value: `${attendedCount}/${participants.length}`, icon: UserCheck, color: "text-teal-300" },
                { label: "أرسلوا الترتيب", value: `${rankingCount}/${participants.length}`, icon: CheckCircle2, color: "text-amber-300" },
                { label: "طلبات المساعدة", value: dashboard?.sos_requests.length || 0, icon: Bell, color: dashboard?.sos_requests.length ? "text-red-300" : "text-slate-300" },
                { label: "مطابقات الخوارزمية", value: phase3Pairs.length, icon: Sparkles, color: "text-violet-300" },
              ].map(item => (
                <div key={item.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3">
                  <div className="flex items-center justify-between"><item.icon size={17} className={item.color} /><span className="text-xl font-black tabular-nums">{item.value}</span></div>
                  <p className="mt-1.5 text-[11px] font-semibold text-slate-400">{item.label}</p>
                </div>
              ))}
            </section>

            <section className="grid gap-2 sm:grid-cols-2">
              <button onClick={() => setTab("feedback")} className={`flex min-h-[5.25rem] items-center gap-3 rounded-2xl border p-3 text-right ${feedbackMissingTotal ? "border-amber-300/25 bg-amber-300/[0.07]" : "border-teal-300/20 bg-teal-300/[0.05]"}`}>
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${feedbackMissingTotal ? "bg-amber-300/12 text-amber-200" : "bg-teal-300/12 text-teal-200"}`}><ClipboardCheck size={21} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2"><span className="text-sm font-black">التقييمات المباشرة</span><span className={`rounded-full px-2 py-1 text-[10px] font-black ${feedbackMissingTotal ? "bg-amber-300/15 text-amber-100" : "bg-teal-300/15 text-teal-100"}`}>{feedbackMissingTotal ? `${feedbackMissingTotal} لم يرسلوا` : "مكتملة حتى الآن"}</span></span>
                  <span className="mt-1.5 block text-[10px] leading-5 text-slate-400">جماعي: {groupFeedbackMissing} معلّق · فردي: {individualFeedbackMissing} معلّق{groupFeedbackPartial ? ` · ${groupFeedbackPartial} جزئي` : ""}</span>
                </span>
              </button>
              <button onClick={() => setTab("messages")} className="flex min-h-[5.25rem] items-center gap-3 rounded-2xl border border-cyan-300/18 bg-cyan-300/[0.045] p-3 text-right">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-200"><MessageCircle size={21} /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-black">التواصل والاطمئنان</span><span className="mt-1.5 block text-[10px] leading-5 text-slate-400">رسالة لمشارك أو للجميع، أو سؤال مزاج لشخص أو طاولة.</span></span>
              </button>
            </section>

            {dashboard?.sos_requests.length ? (
              <button onClick={() => setTab("support")} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-red-400/30 bg-red-950/35 p-3 text-right">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-400/15"><Bell size={20} className="animate-pulse text-red-200" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-black text-red-100">هناك {dashboard.sos_requests.length} طلب مساعدة</span><span className="mt-1 block truncate text-[11px] text-red-200/70">افتحي المتابعة للرد بسرعة</span></span>
              </button>
            ) : null}

            <section className="space-y-3">
              <SectionTitle icon={Sparkles} title="المطابقات جاهزة للرؤية" detail="تظهر المطابقات المقفلة حتى قبل تشغيل الخوارزمية أو توزيع الطاولات." />
              {phase3Pairs.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {phase3Pairs.slice(0, 6).map(pair => (
                    <div key={pairKey(pair.a, pair.b)} className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.05] p-3">
                      <div className="flex items-center gap-2 text-sm font-black"><span className="truncate">{pair.aName}</span><Heart size={14} className="shrink-0 text-violet-300" /><span className="truncate">{pair.bName}</span></div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold"><span className="rounded-full bg-violet-300/10 px-2 py-1 text-violet-200">{pair.source === "test" ? "نتيجة اختبار" : pair.source === "locked" ? "مقفلة قبل التشغيل" : "مطابقة الخوارزمية"}</span><span className="text-amber-200">{pair.table ? `طاولة ${pair.table}` : "بانتظار توزيع الطاولة"}</span>{pair.score != null ? <span className="text-slate-300">توافق {Math.round(Number(pair.score))}%</span> : null}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs leading-6 text-slate-400">لا توجد مطابقة خوارزمية مقفلة لهذه الفعالية حتى الآن.</div>}
              {phase3Pairs.length > 6 ? <button onClick={() => setTab("tables")} className="min-h-11 w-full rounded-xl border border-white/10 text-xs font-bold text-teal-200">عرض كل المطابقات</button> : null}
            </section>

            <section className="space-y-3">
              <SectionTitle icon={Table2} title={round ? `الطاولات الآن · ${ROUND_LABELS[round]}` : "نظرة سريعة على الطاولات"} detail="هذه المعلومات للعرض والتوجيه فقط." />
              {round && tableGroups[round]?.length ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {tableGroups[round].map(group => <div key={group.table} className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3"><p className="text-xs font-black text-amber-200">طاولة {group.table}</p><p className="mt-2 text-[11px] leading-5 text-slate-300">{group.members.map(member => firstName(member.name)).join("، ")}</p></div>)}
                </div>
              ) : <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-400">لا توجد جلسة بطاولات نشطة الآن. كل التوزيعات محفوظة في تبويب الجداول.</div>}
            </section>

            <div className="flex gap-3 rounded-2xl border border-teal-300/15 bg-teal-300/[0.04] p-3 text-[11px] leading-5 text-slate-300"><LockKeyhole size={17} className="mt-0.5 shrink-0 text-teal-300" /><p><span className="font-black text-white">منطقة تشغيل آمنة:</span> لا يمكن من هذه الصفحة تغيير الوقت أو المرحلة أو إعادة المطابقة أو حذف بيانات الفعالية.</p></div>
          </>
        ) : tab === "people" ? (
          <section className="space-y-3">
            <SectionTitle icon={Users} title={`الحضور والمشاركون · ${participants.length}`} detail="اضغطي زر الحضور فقط عند التأكد. الرسالة ترسل تنبيهًا داخل صفحة الفعالية." />
            <div className="relative">
              <Search size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={event => setSearch(event.target.value)} aria-label="البحث عن مشارك" placeholder="ابحثي بالاسم أو الرقم" className="min-h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] py-2 pl-3 pr-10 text-sm outline-none placeholder:text-slate-600 focus:border-teal-300/40" />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {filteredParticipants.map(participant => {
                const phase2Partner = participant.phase2_partner ? participantByNumber.get(Number(participant.phase2_partner)) : null
                const phase3Partner = participant.phase3_partner ? participantByNumber.get(Number(participant.phase3_partner)) : null
                return (
                  <article key={participant.number} className={`rounded-2xl border p-3 ${participant.attended ? "border-teal-300/20 bg-teal-950/20" : "border-white/[0.07] bg-white/[0.03]"}`}>
                    <div className="flex items-start gap-3">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-sm font-black ${participant.attended ? "border-teal-300/25 bg-teal-300/10 text-teal-200" : "border-white/10 bg-black/20 text-slate-400"}`}>#{participant.number}</div>
                      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-black">{participant.name}</h3>{participant.first_time ? <span className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-[9px] font-bold text-cyan-200">أول فعالية</span> : null}</div><p className="mt-1 text-[10px] text-slate-400">{participant.age ? `${participant.age} سنة` : "العمر غير ظاهر"} · {participant.ranking_submitted ? "الترتيب وصل" : "بانتظار الترتيب"}</p></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                      {Object.entries(participant.tables || {}).sort(([a], [b]) => Number(a) - Number(b)).map(([tableRound, table]) => <span key={tableRound} className="rounded-lg bg-amber-300/10 px-2 py-1 text-amber-100">{ROUND_LABELS[Number(tableRound)] || `جولة ${tableRound}`}: {table}</span>)}
                      {phase2Partner ? <span className="rounded-lg bg-pink-300/10 px-2 py-1 text-pink-100">اختيار: {firstName(phase2Partner.name)}</span> : null}
                      {phase3Partner ? <span className="rounded-lg bg-violet-300/10 px-2 py-1 text-violet-100">خوارزمية: {firstName(phase3Partner.name)}</span> : null}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button onClick={() => toggleAttendance(participant)} disabled={toggling[participant.number]} aria-pressed={participant.attended} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-black ${participant.attended ? "border border-teal-300/25 bg-teal-300/10 text-teal-100" : "border border-white/10 bg-white/[0.04] text-slate-200"}`}>{toggling[participant.number] ? <Loader2 size={15} className="animate-spin" /> : participant.attended ? <CheckCircle2 size={16} /> : <Circle size={16} />}{participant.attended ? "حاضرة/حاضر" : "تسجيل حضور"}</button>
                      <button onClick={() => openParticipantMessage(participant)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-black text-slate-200"><Megaphone size={15} /> تنبيه</button>
                    </div>
                  </article>
                )
              })}
            </div>
            {!filteredParticipants.length ? <div className="py-16 text-center text-sm text-slate-400">لا يوجد مشارك يطابق البحث.</div> : null}
          </section>
        ) : tab === "rankings" ? (
          <section className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <SectionTitle icon={ListOrdered} title="تصنيفات المشاركين" detail="ملخص مباشر للترتيبات الحالية. التعديل يعيد ترتيب نفس الأسماء فقط؛ المطابقات التي شُغّلت مسبقًا لا تتغير تلقائيًا." />
              <button onClick={() => fetchRankings()} disabled={rankingsLoading || editingRanker !== null} aria-label="تحديث التصنيفات" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] disabled:opacity-40">
                <RefreshCw size={15} className={rankingsLoading ? "animate-spin" : ""} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3 text-center"><p className="text-xl font-black">{rankings.length || participants.length}</p><p className="mt-1 text-[9px] text-slate-400">الإجمالي</p></div>
              <div className="rounded-2xl border border-teal-300/15 bg-teal-300/[0.04] p-3 text-center"><p className="text-xl font-black text-teal-200">{submittedRankingsCount || (rankings.length ? 0 : rankingCount)}</p><p className="mt-1 text-[9px] text-teal-100/60">أرسلوا</p></div>
              <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-center"><p className="text-xl font-black text-amber-200">{rankings.length ? pendingRankingsCount : Math.max(0, participants.length - rankingCount)}</p><p className="mt-1 text-[9px] text-amber-100/60">لم يرسلوا</p></div>
            </div>

            <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-2">
              <div role="tablist" aria-label="تصفية التصنيفات" className="grid grid-cols-3 gap-1">
                {([
                  { value: "all", label: `الجميع ${rankings.length}` },
                  { value: "submitted", label: `أرسلوا ${submittedRankingsCount}` },
                  { value: "pending", label: `لم يرسلوا ${pendingRankingsCount}` },
                ] as Array<{ value: RankingFilter; label: string }>).map(option => (
                  <button key={option.value} role="tab" aria-selected={rankingFilter === option.value} onClick={() => setRankingFilter(option.value)} className={`min-h-10 rounded-xl text-[10px] font-black ${rankingFilter === option.value ? "bg-teal-400 text-slate-950" : "text-slate-400"}`}>{option.label}</button>
                ))}
              </div>
              <div className="relative">
                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={rankingSearch} onChange={event => setRankingSearch(event.target.value)} aria-label="البحث في التصنيفات" placeholder="ابحثي بالاسم أو الرقم" className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-black/20 py-2 pl-3 pr-9 text-xs outline-none placeholder:text-slate-600 focus:border-teal-300/40" />
              </div>
            </div>

            {rankingsLoading && !rankings.length ? <div className="flex min-h-48 items-center justify-center gap-2 text-xs text-slate-400"><Loader2 size={18} className="animate-spin text-teal-300" /> جاري تحميل التصنيفات…</div> : null}

            <div className="grid gap-2 md:grid-cols-2">
              {filteredRankings.map(ranking => {
                const isEditing = editingRanker === ranking.number
                const tableBadges = rankingTableBadges(ranking.number)
                return (
                  <article key={ranking.number} className={`rounded-2xl border p-3 ${ranking.submitted ? "border-white/[0.08] bg-white/[0.035]" : "border-amber-300/20 bg-amber-300/[0.04]"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-black">{ranking.name} <span className="text-[10px] font-normal text-slate-500">#{ranking.number}</span></h3>
                        {tableBadges.length ? <div className="mt-1.5 flex flex-wrap gap-1">{tableBadges.map(table => <span key={table.key} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-black ${table.live ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-100" : "border-white/[0.07] bg-black/15 text-slate-400"}`}><MapPin size={10} />{table.label}</span>)}</div> : null}
                        <p className={`mt-1.5 text-[10px] font-bold ${ranking.submitted ? "text-teal-200" : "text-amber-200"}`}>{ranking.submitted ? `${ranking.count} أسماء مرتبة${ranking.auto_saved ? " · حفظ تلقائي" : ""}` : "لم يرسل التصنيف بعد"}</p>
                      </div>
                      {ranking.submitted && !isEditing ? <button onClick={() => startRankingEdit(ranking)} disabled={editingRanker !== null} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[10px] font-black text-slate-200 disabled:opacity-40"><Pencil size={13} /> تعديل</button> : null}
                    </div>

                    {ranking.submitted ? (
                      isEditing ? (
                        <div className="mt-3 space-y-2 border-t border-white/[0.07] pt-3">
                          <p className="text-[10px] leading-5 text-amber-100/70">حرّكي الأسماء ثم احفظي. لا يمكن تغيير من هم داخل القائمة.</p>
                          {rankingDraft.map((item, index) => (
                            <div key={item.number} className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 p-2">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-300/10 text-xs font-black text-teal-200">{index + 1}</span>
                              <span className="min-w-0 flex-1 truncate text-xs font-bold">{item.name} <span className="font-normal text-slate-500">#{item.number}</span></span>
                              <button onClick={() => moveRankingItem(index, -1)} disabled={index === 0} aria-label={`رفع ${item.name}`} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.05] text-slate-300 disabled:opacity-20"><ChevronUp size={15} /></button>
                              <button onClick={() => moveRankingItem(index, 1)} disabled={index === rankingDraft.length - 1} aria-label={`خفض ${item.name}`} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.05] text-slate-300 disabled:opacity-20"><ChevronDown size={15} /></button>
                            </div>
                          ))}
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button onClick={saveRankingEdit} disabled={rankingSaving} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-400 text-xs font-black text-slate-950 disabled:opacity-40">{rankingSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} حفظ</button>
                            <button onClick={() => { setEditingRanker(null); setRankingDraft([]) }} disabled={rankingSaving} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-black text-slate-300 disabled:opacity-40">إلغاء</button>
                          </div>
                        </div>
                      ) : (
                        <ol className="mt-3 space-y-1.5">
                          {ranking.ranked_list.map(item => <li key={item.number} className="flex items-center gap-2 rounded-xl bg-black/15 px-2.5 py-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-300/10 text-[10px] font-black text-teal-200">{item.rank}</span><span className="min-w-0 flex-1 truncate text-[11px] text-slate-200">{item.name} <span className="text-slate-500">#{item.number}</span></span></li>)}
                        </ol>
                      )
                    ) : <p className="mt-3 rounded-xl border border-dashed border-amber-300/15 p-3 text-center text-[10px] leading-5 text-amber-100/60">سيظهر ترتيبه هنا فور الإرسال. لا يمكن إنشاء اختيار بالنيابة من لوحة المضيفة.</p>}
                  </article>
                )
              })}
            </div>
            {!rankingsLoading && !filteredRankings.length ? <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-slate-400">لا توجد نتائج تطابق البحث أو التصفية.</div> : null}
          </section>
        ) : tab === "tables" ? (
          <section className="space-y-5">
            <SectionTitle icon={Table2} title="كل الجداول والمطابقات" detail="توزيعات الفعالية كاملة، مع المطابقات المقفلة قبل تعيين الطاولات." />
            {[1, 2, 3, 20, 30].map(tableRound => tableGroups[tableRound]?.length ? (
              <div key={tableRound} className="space-y-2">
                <h3 className="text-xs font-black text-amber-200">{ROUND_LABELS[tableRound]}</h3>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {tableGroups[tableRound].map(group => (
                    <div key={group.table} className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3"><div className="flex items-center justify-between"><span className="text-xs font-black">طاولة {group.table}</span><span className="text-[9px] text-slate-400">{group.members.length} مشاركين</span></div><div className="mt-2 space-y-1">{group.members.map(member => <p key={member.number} className="truncate text-[11px] text-slate-300"><span className="ml-1 text-slate-500">#{member.number}</span>{member.name}</p>)}</div></div>
                  ))}
                </div>
              </div>
            ) : null)}
            {!Object.values(tableGroups).some(groups => groups.length) ? <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-400">لم يتم تعيين أي طاولة بعد.</div> : null}

            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-xs font-black text-pink-200"><Heart size={15} /> مطابقات اختيار المشاركين · {phase2Pairs.length}</h3>
              {phase2Pairs.length ? <div className="grid gap-2 md:grid-cols-2">{phase2Pairs.map(pair => <div key={pairKey(pair.a, pair.b)} className="rounded-2xl border border-pink-300/15 bg-pink-300/[0.04] p-3"><p className="text-sm font-black">{pair.aName} <span className="px-1 text-pink-300">×</span> {pair.bName}</p><p className="mt-1 text-[10px] text-amber-100">{pair.table ? `طاولة ${pair.table}` : "بانتظار الطاولة"}</p></div>)}</div> : <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-400">لم تظهر مطابقات الاختيار بعد.</p>}
            </div>

            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-xs font-black text-violet-200"><Sparkles size={15} /> مطابقات الخوارزمية · {phase3Pairs.length}</h3>
              {phase3Pairs.length ? <div className="grid gap-2 md:grid-cols-2">{phase3Pairs.map(pair => <div key={pairKey(pair.a, pair.b)} className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.04] p-3"><p className="text-sm font-black">{pair.aName} <span className="px-1 text-violet-300">×</span> {pair.bName}</p><div className="mt-2 flex flex-wrap gap-2 text-[10px]"><span className="text-amber-100">{pair.table ? `طاولة ${pair.table}` : "مقفلة · بانتظار الطاولة"}</span>{pair.score != null ? <span className="text-slate-300">توافق {Math.round(Number(pair.score))}%</span> : null}<span className="text-violet-200">{pair.source === "test" ? "اختبار" : pair.source === "locked" ? "محفوظة قبل التشغيل" : "مُولّدة"}</span></div></div>)}</div> : <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-400">لا توجد مطابقات خوارزمية مقفلة لهذه الفعالية.</p>}
            </div>
          </section>
        ) : tab === "feedback" ? (
          <section className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <SectionTitle icon={ClipboardCheck} title="التقييمات والمتابعة" detail={`تتحدث تلقائيًا كل ٨ ثوانٍ${feedbackUpdated ? ` · آخر تحديث ${formatTime(feedbackUpdated.toISOString())}` : ""}`} />
              <button onClick={() => fetchFeedbackData()} disabled={liveLoading} aria-label="تحديث التقييمات" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] disabled:opacity-40"><RefreshCw size={15} className={liveLoading ? "animate-spin" : ""} /></button>
            </div>

            {testMode ? <div className="flex gap-2 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-[10px] leading-5 text-amber-100"><TestTube2 size={16} className="mt-0.5 shrink-0" /><p>المعروض الآن خاص بسياق الاختبار المتاح. لا تُخلط تقييمات المجموعة التجريبية مع الفعالية الفعلية.</p></div> : null}

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3 text-center"><p className="text-lg font-black text-cyan-100">{groupFeedbackSubmitted}/{groupFeedbackExpected}</p><p className="mt-1 text-[9px] text-cyan-100/60">أرسلوا تقييم المجموعة</p>{groupFeedbackPartial ? <p className="mt-1 text-[8px] text-amber-200">{groupFeedbackPartial} قيّموا بعض المجموعة</p> : null}</div>
              <div className="rounded-2xl border border-pink-300/15 bg-pink-300/[0.04] p-3 text-center"><p className="text-lg font-black text-pink-100">{individualFeedbackSubmitted}/{individualFeedbackExpected}</p><p className="mt-1 text-[9px] text-pink-100/60">أرسلوا تقييم اللقاء</p></div>
              <div className={`rounded-2xl border p-3 text-center ${feedbackMissingTotal ? "border-amber-300/20 bg-amber-300/[0.06]" : "border-teal-300/20 bg-teal-300/[0.05]"}`}><p className={`text-lg font-black ${feedbackMissingTotal ? "text-amber-100" : "text-teal-100"}`}>{feedbackMissingTotal}</p><p className={`mt-1 text-[9px] ${feedbackMissingTotal ? "text-amber-100/60" : "text-teal-100/60"}`}>ردود لم تصل بعد</p></div>
            </div>

            <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-2">
              <div role="tablist" aria-label="نوع التقييم" className="grid grid-cols-2 gap-1">
                {([
                  { value: "group", label: `الجماعية · ${groupFeedbackMissing} معلّق` },
                  { value: "individual", label: `الفردية · ${individualFeedbackMissing} معلّق` },
                ] as Array<{ value: FeedbackKind; label: string }>).map(option => <button key={option.value} role="tab" aria-selected={feedbackKind === option.value} onClick={() => setFeedbackKind(option.value)} className={`min-h-11 rounded-xl px-2 text-[11px] font-black ${feedbackKind === option.value ? "bg-teal-300 text-slate-950" : "text-slate-400"}`}>{option.label}</button>)}
              </div>
              <div role="group" aria-label="حالة التقييم" className="grid grid-cols-3 gap-1">
                {([
                  { value: "missing", label: "لم يرسلوا" },
                  { value: "submitted", label: "أرسلوا" },
                  { value: "all", label: "الكل" },
                ] as Array<{ value: FeedbackFilter; label: string }>).map(option => <button key={option.value} aria-pressed={feedbackFilter === option.value} onClick={() => setFeedbackFilter(option.value)} className={`min-h-10 rounded-lg px-1 text-[10px] font-bold ${feedbackFilter === option.value ? "bg-white/[0.1] text-white" : "text-slate-500"}`}>{option.label}</button>)}
              </div>
            </div>

            <div className="relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={feedbackSearch} onChange={event => setFeedbackSearch(event.target.value)} aria-label="البحث في التقييمات" placeholder="ابحثي بالاسم أو الرقم" className="min-h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] py-2 pl-3 pr-10 text-sm outline-none placeholder:text-slate-600 focus:border-teal-300/40" />
            </div>

            {feedbackKind === "group" ? (
              <div className="space-y-5">
                {groupFeedbackRounds.map(roundInfo => {
                  const visibleGroups = roundInfo.groups.map(group => ({
                    ...group,
                    members: group.members.filter(member => {
                      const matchesStatus = feedbackFilter === "all"
                        || (feedbackFilter === "missing" ? member.status === "missing" : member.status === "partial" || member.status === "complete")
                      const matchesSearch = feedbackPersonMatches(member.participant.number, member.participant.name)
                        || member.submissions.some(entry => feedbackPersonMatches(entry.member_number, entry.member_name))
                      return matchesStatus && matchesSearch
                    }),
                  })).filter(group => group.members.length > 0)
                  return (
                    <div key={roundInfo.round} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div><h3 className="text-xs font-black text-cyan-100">{roundInfo.label}</h3><p className="mt-1 text-[9px] text-slate-500">{roundInfo.started ? `${roundInfo.submittedCount} أرسلوا · ${roundInfo.missingCount} لم يرسلوا${roundInfo.partialCount ? ` · ${roundInfo.partialCount} جزئي` : ""}` : "لم يفتح التقييم لهذه الجولة بعد"}</p></div>
                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${roundInfo.started ? roundInfo.missingCount ? "bg-amber-300/10 text-amber-100" : "bg-teal-300/10 text-teal-100" : "bg-white/[0.05] text-slate-400"}`}>{roundInfo.started ? `${roundInfo.submittedCount}/${roundInfo.expectedCount}` : "قريبًا"}</span>
                      </div>
                      {roundInfo.started && roundInfo.expectedCount ? <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-l from-teal-300 to-cyan-300 transition-all" style={{ width: `${Math.round((roundInfo.submittedCount / roundInfo.expectedCount) * 100)}%` }} /></div> : null}
                      {!roundInfo.started ? <div className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-[11px] text-slate-500">ستظهر حالة كل طاولة هنا عند وصول الفعالية إلى تقييم هذه الجولة.</div> : visibleGroups.length ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          {visibleGroups.map(group => (
                            <article key={group.table} className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03]">
                              <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5"><div><p className="text-xs font-black text-amber-100">طاولة {group.table}</p><p className="mt-0.5 text-[9px] text-slate-500">{group.submittedCount}/{group.submittedCount + group.missingCount} أرسلوا</p></div><span className={`flex h-8 min-w-8 items-center justify-center rounded-xl text-[10px] font-black ${group.missingCount ? "bg-amber-300/10 text-amber-100" : "bg-teal-300/10 text-teal-100"}`}>{group.missingCount ? `${group.missingCount} ناقص` : "تم"}</span></div>
                              <div className="divide-y divide-white/[0.05]">
                                {group.members.map(member => {
                                  const statusLabel = member.status === "complete" ? "قيّم الجميع" : member.status === "partial" ? `قيّم ${member.reviewedCount}/${member.expectedCount}` : member.status === "not_applicable" ? "لا يوجد أشخاص آخرون على الطاولة" : "لم يرسل"
                                  const row = <div className="flex min-h-12 items-center gap-2 px-3 py-2.5"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${member.status === "missing" ? "bg-amber-300/10 text-amber-200" : member.status === "partial" ? "bg-cyan-300/10 text-cyan-200" : member.status === "not_applicable" ? "bg-white/[0.05] text-slate-500" : "bg-teal-300/10 text-teal-200"}`}>{member.status === "missing" ? <Clock3 size={14} /> : member.status === "not_applicable" ? <Circle size={14} /> : <CheckCircle2 size={14} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black">{member.participant.name} <span className="font-normal text-slate-500">#{member.participant.number}</span></span><span className={`mt-0.5 block text-[9px] ${member.status === "missing" ? "text-amber-200/70" : "text-slate-400"}`}>{statusLabel}</span></span>{member.submissions.length ? <ChevronDown size={14} className="shrink-0 text-slate-500" /> : null}</div>
                                  return member.submissions.length ? (
                                    <details key={member.participant.number} className="group">
                                      <summary className="cursor-pointer list-none">{row}</summary>
                                      <div className="space-y-2 bg-black/15 px-3 pb-3 pt-1">
                                        {member.submissions.map((entry, index) => <div key={`${entry.member_number}-${index}`} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5"><div className="flex items-center justify-between gap-2"><p className="truncate text-[10px] font-black">عن {entry.member_name} <span className="font-normal text-slate-500">#{entry.member_number}</span></p><span className="shrink-0 text-[9px] text-cyan-200">{experienceLabel(entry.experience)}</span></div>{entry.tags?.length ? <div className="mt-2 flex flex-wrap gap-1">{entry.tags.map(tag => <span key={tag} className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-[8px] text-cyan-100">{tag}</span>)}</div> : null}{entry.organizer_note ? <p className="mt-2 rounded-lg bg-amber-300/[0.06] px-2 py-1.5 text-[9px] leading-5 text-amber-100">ملاحظة: {entry.organizer_note}</p> : null}</div>)}
                                      </div>
                                    </details>
                                  ) : <div key={member.participant.number}>{row}</div>
                                })}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-400">لا توجد نتائج تطابق البحث أو التصفية في هذه الجولة.</div>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-5">
                {individualFeedbackPhases.map(phaseInfo => {
                  const visiblePairs = phaseInfo.pairs.filter(pair => {
                    const matchesStatus = feedbackFilter === "all"
                      || (feedbackFilter === "missing" ? pair.missingCount > 0 : pair.submittedCount > 0)
                    const matchesSearch = pair.members.some(member => feedbackPersonMatches(member.participant.number, member.participant.name))
                    return matchesStatus && matchesSearch
                  })
                  return (
                    <div key={phaseInfo.key} className="space-y-2">
                      <div className="flex items-center justify-between gap-3"><div><h3 className={`text-xs font-black ${phaseInfo.key === "phase2" ? "text-pink-100" : "text-violet-100"}`}>{phaseInfo.label}</h3><p className="mt-1 text-[9px] text-slate-500">{phaseInfo.started ? `${phaseInfo.submittedCount} أرسلوا · ${phaseInfo.missingCount} لم يرسلوا` : "لم يبدأ التقييم بعد"}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${phaseInfo.started ? phaseInfo.missingCount ? "bg-amber-300/10 text-amber-100" : "bg-teal-300/10 text-teal-100" : "bg-white/[0.05] text-slate-400"}`}>{phaseInfo.started ? `${phaseInfo.submittedCount}/${phaseInfo.expectedCount}` : "قريبًا"}</span></div>
                      {phaseInfo.started && phaseInfo.expectedCount ? <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full transition-all ${phaseInfo.key === "phase2" ? "bg-gradient-to-l from-pink-300 to-rose-300" : "bg-gradient-to-l from-violet-300 to-purple-300"}`} style={{ width: `${Math.round((phaseInfo.submittedCount / phaseInfo.expectedCount) * 100)}%` }} /></div> : null}
                      {!phaseInfo.started ? <div className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-[11px] text-slate-500">ستظهر حالة كل لقاء هنا فور بدء هذه المرحلة.</div> : visiblePairs.length ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          {visiblePairs.map(pair => (
                            <article key={pair.key} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
                              <div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-black text-amber-100">{pair.table ? `طاولة ${pair.table}` : "بدون طاولة"}</p><p className="mt-1 text-[9px] text-slate-500">وصل {pair.submittedCount} من 2</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${pair.missingCount ? "bg-amber-300/10 text-amber-100" : "bg-teal-300/10 text-teal-100"}`}>{pair.missingCount ? `${pair.missingCount} ناقص` : pair.members.some(member => member.entry?.mutual_yes) ? "رغبة متبادلة" : "مكتمل"}</span></div>
                              <div className="mt-3 space-y-2">
                                {pair.members.map(member => {
                                  const feedback = member.entry?.feedback || null
                                  const compatibility = feedbackMetric(feedback, "compatibilityRate")
                                  const conversation = feedbackMetric(feedback, "conversationQuality")
                                  const connection = feedbackMetric(feedback, "personalConnection")
                                  const organizerNote = typeof feedback?.organizerImpression === "string" ? feedback.organizerImpression : ""
                                  return <div key={member.participant.number} className={`rounded-xl border p-2.5 ${member.submitted ? "border-teal-300/15 bg-teal-300/[0.035]" : "border-amber-300/15 bg-amber-300/[0.035]"}`}><div className="flex items-center gap-2"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${member.submitted ? "bg-teal-300/10 text-teal-200" : "bg-amber-300/10 text-amber-200"}`}>{member.submitted ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}</span><span className="min-w-0 flex-1 truncate text-[11px] font-black">{member.participant.name} <span className="font-normal text-slate-500">#{member.participant.number}</span></span><span className={`text-[9px] font-bold ${member.submitted ? "text-teal-200" : "text-amber-200"}`}>{member.submitted ? "أرسل" : "لم يرسل"}</span></div>{member.submitted ? <><div className="mt-2 grid grid-cols-4 gap-1 text-center"><div className="rounded-lg bg-black/20 p-1.5"><p className="text-[10px] font-black">{compatibility != null ? `${compatibility}%` : "—"}</p><p className="mt-0.5 text-[7px] text-slate-500">توافقه</p></div><div className="rounded-lg bg-black/20 p-1.5"><p className="text-[10px] font-black">{conversation || "—"}/5</p><p className="mt-0.5 text-[7px] text-slate-500">المحادثة</p></div><div className="rounded-lg bg-black/20 p-1.5"><p className="text-[10px] font-black">{connection || "—"}/5</p><p className="mt-0.5 text-[7px] text-slate-500">الراحة</p></div><div className="rounded-lg bg-black/20 p-1.5"><p className={`text-[10px] font-black ${feedback?.wantConnect === true ? "text-teal-200" : feedback?.wantConnect === false ? "text-slate-300" : ""}`}>{feedback?.wantConnect === true ? "نعم" : feedback?.wantConnect === false ? "لا" : "—"}</p><p className="mt-0.5 text-[7px] text-slate-500">تواصل</p></div></div>{organizerNote ? <p className="mt-2 rounded-lg bg-amber-300/[0.06] px-2 py-1.5 text-[9px] leading-5 text-amber-100">ملاحظة: {organizerNote}</p> : null}</> : <p className="mt-1.5 pr-10 text-[9px] text-amber-100/60">بانتظار تقييمه عن لقاء {member.entry?.partner_name || pair.members.find(other => other.participant.number !== member.participant.number)?.participant.name}</p>}</div>
                                })}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-400">لا توجد لقاءات تطابق البحث أو التصفية في هذه المرحلة.</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ) : tab === "support" ? (
          <section className="space-y-5">
            <div className="flex items-center justify-between gap-3"><SectionTitle icon={Headphones} title="المساعدة والمتابعة المباشرة" detail="تتحدث تلقائيًا كل ١٠ ثوانٍ." /><button onClick={() => fetchOperationsData()} disabled={liveLoading} aria-label="تحديث المتابعة" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"><RefreshCw size={15} className={liveLoading ? "animate-spin" : ""} /></button></div>

            <div className="space-y-2">
              <h3 className="text-xs font-black text-red-200">طلبات المساعدة المفتوحة · {dashboard?.sos_requests.length || 0}</h3>
              {!dashboard?.sos_requests.length ? <div className="rounded-2xl border border-teal-300/15 bg-teal-300/[0.04] p-5 text-center"><CheckCircle2 size={25} className="mx-auto text-teal-300" /><p className="mt-2 text-xs font-bold text-teal-100">لا توجد طلبات مفتوحة الآن</p></div> : dashboard.sos_requests.map(request => (
                <article key={request.id} className="rounded-2xl border border-red-300/20 bg-red-950/25 p-4">
                  <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-black">{request.participant_name || `#${request.participant_number}`}</h4><span className="text-[10px] text-slate-400">#{request.participant_number}</span></div>{request.table_info ? <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-200"><MapPin size={11} />{request.table_info}</p> : null}</div><span className="text-[9px] text-slate-400">{formatTime(request.updated_at || request.created_at)}</span></div>
                  {request.message ? <p className="mt-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-sm leading-6 text-slate-100">{request.message}</p> : null}
                  {request.organizer_reply ? <p className="mt-2 text-[11px] text-teal-200">آخر رد: {request.organizer_reply}</p> : null}
                  <label htmlFor={`reply-${request.id}`} className="sr-only">الرد على {request.participant_name || request.participant_number}</label>
                  <div className="mt-3 flex gap-2"><input id={`reply-${request.id}`} value={replyText[request.id] || ""} onChange={event => setReplyText(previous => ({ ...previous, [request.id]: event.target.value }))} onKeyDown={event => { if (event.key === "Enter") replySos(request) }} placeholder="اكتبي ردًا واضحًا…" className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/20 px-3 text-sm outline-none placeholder:text-slate-600 focus:border-teal-300/40" /><button onClick={() => replySos(request)} disabled={!replyText[request.id]?.trim() || sosBusy[request.id]} aria-label="إرسال الرد" className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-400 text-slate-950 disabled:opacity-40">{sosBusy[request.id] ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</button></div>
                  <button onClick={() => resolveSos(request)} disabled={sosBusy[request.id]} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-bold text-slate-200 disabled:opacity-40"><CheckCircle2 size={15} /> تم الحل — إغلاق الطلب</button>
                </article>
              ))}
            </div>

            {liveData.moodChecks[0] ? <div className="rounded-2xl border border-teal-300/15 bg-teal-300/[0.04] p-3"><div className="flex items-center justify-between"><p className="text-xs font-black text-teal-100">آخر سؤال اطمئنان</p><span className="text-[9px] text-slate-400">{formatTime(liveData.moodChecks[0].triggered_at)}</span></div><div className="mt-3 grid grid-cols-5 gap-1 text-center text-[9px]">{[{ key: "happy", label: "ممتاز" }, { key: "neutral", label: "عادي" }, { key: "not_great", label: "مو مره" }, { key: "expired", label: "انتهى" }, { key: null, label: "لم يرد" }].map(item => { const count = liveData.moodChecks[0].entries.filter(entry => item.key ? entry.mood === item.key : !entry.mood).length; return <div key={item.label} className="rounded-lg bg-black/20 p-2"><p className="font-black text-white">{count}</p><p className="mt-1 text-slate-400">{item.label}</p></div> })}</div></div> : null}
          </section>
        ) : (
          <section className="space-y-4">
            <SectionTitle icon={MessageCircle} title="الرسائل والتنبيهات" detail="تنبيهات آمنة داخل صفحة الفعالية لفرد أو للجميع بعد التأكيد." />

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
              <div className="space-y-3">
                <div><label htmlFor="message-target" className="mb-1.5 block text-xs font-bold text-slate-300">المستلم</label><select id="message-target" value={messageTarget} onChange={event => setMessageTarget(event.target.value)} className="min-h-12 w-full rounded-xl border border-white/10 bg-[#0b1019] px-3 text-sm text-white outline-none focus:border-teal-300/40"><option value="">جميع المشاركين ({participants.length})</option>{participants.map(participant => <option key={participant.number} value={participant.number}>#{participant.number} · {participant.name}</option>)}</select></div>
                <div><label htmlFor="notification-title" className="mb-1.5 block text-xs font-bold text-slate-300">عنوان التنبيه</label><input id="notification-title" value={notificationTitle} onChange={event => setNotificationTitle(event.target.value)} maxLength={120} placeholder="مثال: التوجه إلى الطاولات" className="min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none placeholder:text-slate-600 focus:border-teal-300/40" /></div>
                <div><label htmlFor="message-body" className="mb-1.5 block text-xs font-bold text-slate-300">نص الرسالة</label><textarea id="message-body" value={messageBody} onChange={event => setMessageBody(event.target.value)} maxLength={1000} rows={6} placeholder="اكتبي الرسالة بوضوح…" className="w-full resize-none rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-7 outline-none placeholder:text-slate-600 focus:border-teal-300/40" /><p className="mt-1 text-left text-[9px] text-slate-500">{messageBody.length}/1000</p></div>
                {!messageTarget ? <div className="flex gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-[11px] leading-5 text-amber-100"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><p>المستلم الآن: جميع المشاركين. سيظهر تأكيد قبل الإرسال الجماعي.</p></div> : null}
                <button onClick={sendMessage} disabled={messageBusy || !messageBody.trim() || !notificationTitle.trim()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-400 font-black text-slate-950 disabled:opacity-40">{messageBusy ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} إرسال التنبيه</button>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.045] p-4">
              <div className="flex items-start justify-between gap-3">
                <div><h3 className="flex items-center gap-2 text-sm font-black text-cyan-100"><Heart size={17} className="text-cyan-300" /> سؤال الاطمئنان</h3><p className="mt-1 text-[10px] leading-5 text-slate-400">اختاري شخصًا، طاولة واحدة، أو كل الطاولات النشطة. يشمل الجلسات الجماعية واللقاءات الفردية.</p></div>
                {moodRound != null ? <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-2 py-1 text-[9px] font-black text-cyan-100">{ROUND_LABELS[moodRound]}</span> : null}
              </div>

              {moodRound != null && activeMoodGroups.length ? (
                <div className="mt-4 space-y-3">
                  <div role="tablist" aria-label="نطاق سؤال الاطمئنان" className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-black/20 p-1">
                    {([
                      { value: "person", label: "شخص واحد" },
                      { value: "table", label: "طاولة واحدة" },
                      { value: "all_tables", label: "كل الطاولات" },
                    ] as Array<{ value: MoodAudience; label: string }>).map(option => <button key={option.value} role="tab" aria-selected={moodAudience === option.value} onClick={() => setMoodAudience(option.value)} className={`min-h-10 rounded-lg px-1 text-[10px] font-black ${moodAudience === option.value ? "bg-cyan-300 text-slate-950" : "text-slate-400"}`}>{option.label}</button>)}
                  </div>

                  {moodAudience === "person" ? (
                    <div><label htmlFor="mood-person" className="mb-1.5 block text-xs font-bold text-slate-300">المشارك الموجود على طاولة نشطة</label><select id="mood-person" value={selectedMoodParticipant} onChange={event => setMoodParticipant(event.target.value)} className="min-h-12 w-full rounded-xl border border-white/10 bg-[#0b1019] px-3 text-sm text-white outline-none focus:border-cyan-300/40">{activeMoodParticipants.map(participant => <option key={participant.number} value={participant.number}>#{participant.number} · {participant.name} · طاولة {participant.tables?.[String(moodRound)]}</option>)}</select></div>
                  ) : moodAudience === "table" ? (
                    <div className="space-y-2"><label htmlFor="mood-table" className="block text-xs font-bold text-slate-300">الطاولة النشطة</label><select id="mood-table" value={selectedMoodTable} onChange={event => setMoodTable(event.target.value)} className="min-h-12 w-full rounded-xl border border-white/10 bg-[#0b1019] px-3 text-sm text-white outline-none focus:border-cyan-300/40">{activeMoodGroups.map(group => <option key={group.table} value={group.table}>طاولة {group.table} · {group.members.length} مشاركين</option>)}</select>{selectedMoodGroup ? <p className="rounded-xl bg-black/20 px-3 py-2 text-[10px] leading-5 text-slate-300">{selectedMoodGroup.members.map(member => firstName(member.name)).join("، ")}</p> : null}</div>
                  ) : (
                    <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] p-3 text-center"><p className="text-sm font-black text-cyan-100">{activeMoodGroups.length} طاولات · {activeMoodParticipantCount} مشاركين</p><p className="mt-1 text-[10px] text-cyan-100/60">سيصل السؤال فقط لمن لديهم طاولة في الجلسة النشطة.</p></div>
                  )}

                  <button onClick={sendMoodCheck} disabled={messageBusy || !canSendMoodCheck} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-3 text-xs font-black text-slate-950 disabled:opacity-40">{messageBusy ? <Loader2 size={17} className="animate-spin" /> : <Heart size={17} />} إرسال «كيف وضعك؟» إلى {moodTargetLabel}</button>
                </div>
              ) : (
                <div className="mt-4 flex gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-[11px] leading-5 text-amber-100"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><p>لا توجد طاولات نشطة في المرحلة الحالية. عند بدء جلسة جماعية أو لقاء فردي ستظهر خيارات الإرسال هنا تلقائيًا.</p></div>
              )}
            </div>

            <div className="space-y-2"><h3 className="text-xs font-black text-slate-200">آخر التنبيهات</h3>{liveData.notifications.slice(0, 8).map(notification => { const seen = notification.entries.filter(entry => entry.seen_at).length; return <div key={notification.notif_id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">{notification.title}</p>{notification.body ? <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-400">{notification.body}</p> : null}</div><span className="shrink-0 text-[9px] text-slate-500">{formatTime(notification.created_at)}</span></div><p className="mt-2 text-[9px] text-teal-200">شاهده {seen} من {notification.entries.length}</p></div> })}{!liveData.notifications.length ? <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-400">لا توجد تنبيهات سابقة.</p> : null}</div>
          </section>
        )}
      </main>

      <nav aria-label="أقسام لوحة رنيم" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#080c13]/97 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur-xl">
        <div role="tablist" className="mx-auto grid max-w-2xl grid-cols-6 gap-1">
          {tabs.map(item => (
            <button key={item.value} role="tab" aria-selected={tab === item.value} onClick={() => setTab(item.value)} className={`relative flex min-h-[3.4rem] flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold transition ${tab === item.value ? "bg-teal-300/12 text-teal-200" : "text-slate-400"}`}>
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.badge ? <span className={`absolute right-[calc(50%-18px)] top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-black text-slate-950 ${item.badgeTone === "red" ? "bg-red-400 text-white" : "bg-amber-300"}`}>{item.badge > 99 ? "99+" : item.badge}</span> : null}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
