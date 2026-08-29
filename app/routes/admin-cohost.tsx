import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Circle,
  Clock3,
  Heart,
  Headphones,
  LayoutDashboard,
  Loader2,
  Lock,
  LockKeyhole,
  LogOut,
  MapPin,
  Megaphone,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Table2,
  TestTube2,
  UserCheck,
  Users,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react"

const API = "/api/admin"
const SESSION_KEY = "event3_cohost_token"

type CohostTab = "home" | "people" | "tables" | "support" | "messages"
type MessageChannel = "notification" | "whatsapp"

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

const WHATSAPP_TEMPLATES = [
  {
    label: "اعتذار وتصحيح السداد",
    text: "*تنبيه وتصحيح مهم* 🤍\n\nنعتذر عن الخطأ في الرسالة السابقة. آخر موعد للسداد هو *السبت الساعة ١ ظهرًا*، وليس الثلاثاء.\n\nإذا تم السداد بالفعل، فسيُحتسب أي مبلغ إضافي كخصم للفعاليات القادمة.\n\nشكرًا لتفهمك، ونعتذر مرة أخرى عن اللبس.",
  },
  {
    label: "توجيه للطاولة",
    text: "مرحبًا 🤍\n\nيرجى التوجه إلى طاولتك الموضحة في صفحة الفعالية. إذا احتجت أي مساعدة أرسل لنا مباشرة.",
  },
  {
    label: "اعتذار عن التأخير",
    text: "مرحبًا 🤍\n\nنعتذر عن التأخير البسيط. الفريق يعمل على تجهيز الخطوة التالية، وسنبلغك فور جاهزيتها. شكرًا لصبرك.",
  },
] as const

function activeRound(phase?: string) {
  if (phase === "round1") return 1
  if (phase === "round2") return 2
  if (phase === "phase2_reveal") return 20
  if (phase === "phase3_reveal") return 30
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

function feedbackDescription(feedback: Record<string, unknown> | null) {
  if (!feedback) return "لم يصل الرد بعد"
  const connection = feedback.wantConnect === true
    ? "يرغب بالتواصل"
    : feedback.wantConnect === false
      ? "لا يرغب بالتواصل"
      : null
  const rating = feedback.rating ?? feedback.overallRating ?? feedback.experience ?? feedback.vibe
  const note = feedback.note ?? feedback.comment ?? feedback.comments
  return [connection, rating != null ? `التقييم: ${String(rating)}` : null, typeof note === "string" ? note : null]
    .filter(Boolean)
    .join(" · ") || "تم إرسال الرد"
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
  const [messageChannel, setMessageChannel] = useState<MessageChannel>("notification")
  const [messageTarget, setMessageTarget] = useState("")
  const [notificationTitle, setNotificationTitle] = useState("")
  const [messageBody, setMessageBody] = useState("")
  const [messageBusy, setMessageBusy] = useState(false)
  const dashboardRequest = useRef(0)

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

  const fetchLiveData = useCallback(async (quiet = false) => {
    if (!token) return
    if (!quiet) setLiveLoading(true)
    const results = await Promise.allSettled([
      cohostApi<GroupFeedbackResponse>("e3-get-group-member-feedback", token),
      cohostApi<MatchFeedbackResponse>("e3-get-feedback", token),
      cohostApi<{ checks: MoodCheckGroup[] }>("e3-get-mood-checks", token),
      cohostApi<{ notifications: NotificationGroup[] }>("e3-get-notifications", token),
    ])
    setLiveData(previous => ({
      groupFeedback: results[0].status === "fulfilled" ? results[0].value : previous.groupFeedback,
      matchFeedback: results[1].status === "fulfilled" ? results[1].value : previous.matchFeedback,
      moodChecks: results[2].status === "fulfilled" ? results[2].value.checks || [] : previous.moodChecks,
      notifications: results[3].status === "fulfilled" ? results[3].value.notifications || [] : previous.notifications,
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
    return () => window.clearInterval(interval)
  }, [fetchDashboard, token])

  useEffect(() => {
    if (!token || (tab !== "support" && tab !== "messages")) return
    fetchLiveData()
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchLiveData(true)
    }, 10000)
    return () => window.clearInterval(interval)
  }, [fetchLiveData, tab, token])

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
    setMessageChannel("whatsapp")
    setMessageBody(`مرحبًا ${firstName(participant.name)} 🤍\n\n`)
    setTab("messages")
  }

  const sendMessage = async () => {
    if (!token || messageBusy) return
    const targetNumber = messageTarget ? Number(messageTarget) : null
    if (messageChannel === "whatsapp" && !targetNumber) {
      setError("اختاري مشاركًا واحدًا لإرسال واتساب")
      return
    }
    if (!messageBody.trim()) {
      setError("اكتبي نص الرسالة أولًا")
      return
    }
    if (messageChannel === "notification" && !notificationTitle.trim()) {
      setError("اكتبي عنوان التنبيه")
      return
    }
    if (messageChannel === "notification" && !targetNumber) {
      if (!window.confirm(`سيصل هذا التنبيه إلى جميع المشاركين (${participants.length}). هل أنتِ متأكدة؟`)) return
    }
    if (messageChannel === "whatsapp" && testMode) {
      const participant = participantByNumber.get(targetNumber as number)
      if (!window.confirm(`وضع الاختبار يعمل، لكن هذه رسالة واتساب حقيقية إلى ${participant?.name || `#${targetNumber}`}. هل تريدين إرسالها؟`)) return
    }
    setMessageBusy(true)
    setError("")
    try {
      if (messageChannel === "whatsapp") {
        const data = await cohostApi<{ sent: boolean; status?: string }>("e3-cohost-send-whatsapp", token, {
          participant_number: targetNumber,
          message: messageBody.trim(),
          confirm_test_send: testMode,
        })
        if (!data.sent) throw new Error("لم يقبل واتساب الرسالة")
        setNotice("تم تسليم الرسالة إلى Twilio للإرسال")
      } else {
        const data = await cohostApi<{ sent_to: number }>("e3-send-notification", token, {
          target_number: targetNumber || undefined,
          title: notificationTitle.trim(),
          body: messageBody.trim(),
          icon: "info",
          confirm_all: !targetNumber,
        })
        setNotice(`تم إرسال التنبيه إلى ${data.sent_to} مشارك${data.sent_to === 1 ? "" : "ين"}`)
      }
      setMessageBody("")
      setNotificationTitle("")
      await fetchLiveData(true)
    } catch (requestError) {
      handleRequestError(requestError, "تعذر إرسال الرسالة")
    } finally {
      setMessageBusy(false)
    }
  }

  const sendMoodCheck = async () => {
    if (!token || messageBusy) return
    const targetNumber = messageTarget ? Number(messageTarget) : null
    const targetName = targetNumber ? participantByNumber.get(targetNumber)?.name || `#${targetNumber}` : `كل المشاركين (${participants.length})`
    if (!window.confirm(`إرسال سؤال الاطمئنان إلى ${targetName}؟`)) return
    setMessageBusy(true)
    try {
      const data = await cohostApi<{ sent_to: number }>("e3-trigger-mood-check", token, {
        target_number: targetNumber || undefined,
        confirm_all: !targetNumber,
      })
      setNotice(`تم إرسال سؤال الاطمئنان إلى ${data.sent_to}`)
      await fetchLiveData(true)
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

  const tabs: Array<{ value: CohostTab; label: string; icon: LucideIcon; badge?: number }> = [
    { value: "home", label: "الرئيسية", icon: LayoutDashboard },
    { value: "people", label: "الحضور", icon: Users },
    { value: "tables", label: "الجداول", icon: Table2 },
    { value: "support", label: "المتابعة", icon: Headphones, badge: dashboard?.sos_requests.length || 0 },
    { value: "messages", label: "الرسائل", icon: MessageCircle },
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
              <button onClick={() => fetchDashboard()} disabled={loading} aria-label="تحديث البيانات" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 disabled:opacity-50">
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
            <div><p className="text-xs font-black">وضع الاختبار يعمل الآن</p><p className="mt-1 text-[11px] leading-5 text-amber-100/75">النتائج المعروضة تجريبية. واتساب ما زال يصل إلى أرقام حقيقية، لذلك سيطلب منكِ تأكيدًا إضافيًا.</p></div>
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
            <SectionTitle icon={Users} title={`الحضور والمشاركون · ${participants.length}`} detail="اضغطي زر الحضور فقط عند التأكد. الرسالة تفتح واتساب للمشارك المحدد." />
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
                      <button onClick={() => openParticipantMessage(participant)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-black text-slate-200"><Smartphone size={15} /> رسالة</button>
                    </div>
                  </article>
                )
              })}
            </div>
            {!filteredParticipants.length ? <div className="py-16 text-center text-sm text-slate-400">لا يوجد مشارك يطابق البحث.</div> : null}
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
        ) : tab === "support" ? (
          <section className="space-y-5">
            <div className="flex items-center justify-between gap-3"><SectionTitle icon={Headphones} title="المساعدة والمتابعة المباشرة" detail="تتحدث تلقائيًا كل ١٠ ثوانٍ." /><button onClick={() => fetchLiveData()} disabled={liveLoading} aria-label="تحديث المتابعة" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"><RefreshCw size={15} className={liveLoading ? "animate-spin" : ""} /></button></div>

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

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3"><p className="text-[10px] text-slate-400">تقييمات المجموعة</p><p className="mt-1 text-xl font-black">{liveData.groupFeedback.submissions.length}</p></div>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3"><p className="text-[10px] text-slate-400">ردود اللقاءات</p><p className="mt-1 text-xl font-black">{liveData.matchFeedback.phase2_submitted + liveData.matchFeedback.phase3_submitted}</p></div>
            </div>

            <div className="space-y-2"><h3 className="text-xs font-black text-cyan-200">آخر ملاحظات المشاركين</h3>{liveData.groupFeedback.submissions.length ? liveData.groupFeedback.submissions.slice(0, 12).map((entry, index) => <div key={`${entry.reviewer_number}-${entry.member_number}-${entry.group_round}-${index}`} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3"><div className="flex items-center justify-between gap-3"><p className="truncate text-xs font-black">{entry.reviewer_name} ← عن {entry.member_name}</p><span className="shrink-0 text-[9px] text-slate-500">جولة {entry.group_round}</span></div><p className="mt-2 text-[11px] leading-5 text-slate-300">{entry.experience || "بدون وصف"}{entry.organizer_note ? ` · ${entry.organizer_note}` : ""}</p>{entry.tags?.length ? <div className="mt-2 flex flex-wrap gap-1">{entry.tags.map(tag => <span key={tag} className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-[9px] text-cyan-100">{tag}</span>)}</div> : null}</div>) : <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-400">لم تصل ملاحظات جماعية بعد.</p>}</div>

            <div className="space-y-2"><h3 className="text-xs font-black text-pink-200">ردود اللقاءات الفردية</h3>{[...liveData.matchFeedback.phase2, ...liveData.matchFeedback.phase3].filter(entry => entry.submitted).slice(0, 12).map((entry, index) => <div key={`${entry.participant_number}-${entry.partner_number}-${index}`} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-black">{entry.participant_name} ← لقاء {entry.partner_name}</p>{entry.mutual_yes ? <span className="shrink-0 rounded-full bg-teal-300/10 px-2 py-0.5 text-[9px] text-teal-100">رغبة متبادلة</span> : null}</div><p className="mt-2 text-[11px] leading-5 text-slate-300">{feedbackDescription(entry.feedback)}</p></div>)}{![...liveData.matchFeedback.phase2, ...liveData.matchFeedback.phase3].some(entry => entry.submitted) ? <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-400">لم تصل ردود اللقاءات بعد.</p> : null}</div>

            {liveData.moodChecks[0] ? <div className="rounded-2xl border border-teal-300/15 bg-teal-300/[0.04] p-3"><div className="flex items-center justify-between"><p className="text-xs font-black text-teal-100">آخر سؤال اطمئنان</p><span className="text-[9px] text-slate-400">{formatTime(liveData.moodChecks[0].triggered_at)}</span></div><div className="mt-3 grid grid-cols-4 gap-1 text-center text-[10px]">{[{ key: "good", label: "بخير" }, { key: "neutral", label: "عادي" }, { key: "bad", label: "يحتاج مساعدة" }, { key: null, label: "لم يرد" }].map(item => { const count = liveData.moodChecks[0].entries.filter(entry => item.key ? [item.key, item.key === "good" ? "happy" : item.key === "bad" ? "sad" : item.key].includes(entry.mood || "") : !entry.mood).length; return <div key={item.label} className="rounded-lg bg-black/20 p-2"><p className="font-black text-white">{count}</p><p className="mt-1 text-slate-400">{item.label}</p></div> })}</div></div> : null}
          </section>
        ) : (
          <section className="space-y-4">
            <SectionTitle icon={MessageCircle} title="الرسائل والتنبيهات" detail="واتساب لمشارك واحد، أو تنبيه داخل الصفحة لفرد أو للجميع بعد التأكيد." />

            <div role="tablist" aria-label="نوع الرسالة" className="grid grid-cols-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-1">
              <button role="tab" aria-selected={messageChannel === "notification"} onClick={() => setMessageChannel("notification")} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl text-xs font-black ${messageChannel === "notification" ? "bg-teal-400 text-slate-950" : "text-slate-300"}`}><Megaphone size={16} /> تنبيه داخل الفعالية</button>
              <button role="tab" aria-selected={messageChannel === "whatsapp"} onClick={() => setMessageChannel("whatsapp")} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl text-xs font-black ${messageChannel === "whatsapp" ? "bg-emerald-400 text-slate-950" : "text-slate-300"}`}><Smartphone size={16} /> واتساب</button>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
              <div className="space-y-3">
                <div><label htmlFor="message-target" className="mb-1.5 block text-xs font-bold text-slate-300">المستلم</label><select id="message-target" value={messageTarget} onChange={event => setMessageTarget(event.target.value)} className="min-h-12 w-full rounded-xl border border-white/10 bg-[#0b1019] px-3 text-sm text-white outline-none focus:border-teal-300/40"><option value="">{messageChannel === "notification" ? `جميع المشاركين (${participants.length})` : "اختاري مشاركًا"}</option>{participants.map(participant => <option key={participant.number} value={participant.number}>#{participant.number} · {participant.name}</option>)}</select></div>
                {messageChannel === "notification" ? <div><label htmlFor="notification-title" className="mb-1.5 block text-xs font-bold text-slate-300">عنوان التنبيه</label><input id="notification-title" value={notificationTitle} onChange={event => setNotificationTitle(event.target.value)} maxLength={120} placeholder="مثال: التوجه إلى الطاولات" className="min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none placeholder:text-slate-600 focus:border-teal-300/40" /></div> : null}
                {messageChannel === "whatsapp" ? <div><p className="mb-2 text-xs font-bold text-slate-300">قوالب سريعة</p><div className="flex gap-2 overflow-x-auto pb-1">{WHATSAPP_TEMPLATES.map(template => <button key={template.label} onClick={() => setMessageBody(template.text)} className="min-h-11 shrink-0 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] px-3 text-[11px] font-bold text-emerald-100">{template.label}</button>)}</div></div> : null}
                <div><label htmlFor="message-body" className="mb-1.5 block text-xs font-bold text-slate-300">نص الرسالة</label><textarea id="message-body" value={messageBody} onChange={event => setMessageBody(event.target.value)} maxLength={1000} rows={6} placeholder="اكتبي الرسالة بوضوح…" className="w-full resize-none rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-7 outline-none placeholder:text-slate-600 focus:border-teal-300/40" /><p className="mt-1 text-left text-[9px] text-slate-500">{messageBody.length}/1000</p></div>
                {testMode && messageChannel === "whatsapp" ? <div className="flex gap-2 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-[11px] leading-5 text-amber-100"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><p>رسالة واتساب حقيقية رغم وضع الاختبار. سيظهر تأكيد أخير قبل الإرسال.</p></div> : null}
                {!messageTarget && messageChannel === "notification" ? <div className="flex gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-[11px] leading-5 text-amber-100"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><p>المستلم الآن: جميع المشاركين. سيظهر تأكيد قبل الإرسال الجماعي.</p></div> : null}
                <button onClick={sendMessage} disabled={messageBusy || !messageBody.trim() || (messageChannel === "whatsapp" && !messageTarget)} className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl font-black text-slate-950 disabled:opacity-40 ${messageChannel === "whatsapp" ? "bg-emerald-400" : "bg-teal-400"}`}>{messageBusy ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} {messageChannel === "whatsapp" ? "إرسال واتساب" : "إرسال التنبيه"}</button>
              </div>
            </div>

            <button onClick={sendMoodCheck} disabled={messageBusy || participants.length === 0} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] text-xs font-black text-cyan-100 disabled:opacity-40"><Heart size={17} /> إرسال سؤال «كيف وضعك؟» إلى {messageTarget ? participantByNumber.get(Number(messageTarget))?.name || `#${messageTarget}` : "الجميع"}</button>

            <div className="space-y-2"><h3 className="text-xs font-black text-slate-200">آخر التنبيهات</h3>{liveData.notifications.slice(0, 8).map(notification => { const seen = notification.entries.filter(entry => entry.seen_at).length; return <div key={notification.notif_id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">{notification.title}</p>{notification.body ? <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-400">{notification.body}</p> : null}</div><span className="shrink-0 text-[9px] text-slate-500">{formatTime(notification.created_at)}</span></div><p className="mt-2 text-[9px] text-teal-200">شاهده {seen} من {notification.entries.length}</p></div> })}{!liveData.notifications.length ? <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-400">لا توجد تنبيهات سابقة.</p> : null}</div>
          </section>
        )}
      </main>

      <nav aria-label="أقسام لوحة رنيم" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#080c13]/97 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur-xl">
        <div role="tablist" className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
          {tabs.map(item => (
            <button key={item.value} role="tab" aria-selected={tab === item.value} onClick={() => setTab(item.value)} className={`relative flex min-h-[3.4rem] flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold transition ${tab === item.value ? "bg-teal-300/12 text-teal-200" : "text-slate-400"}`}>
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.badge ? <span className="absolute right-[calc(50%-18px)] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white">{item.badge}</span> : null}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
