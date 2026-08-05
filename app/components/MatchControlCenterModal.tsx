import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Ban,
  Brain,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  Eye,
  Filter,
  Heart,
  History,
  Info,
  Link2,
  Loader2,
  Lock,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Undo2,
  Unlock,
  UserMinus,
  UserRound,
  Users,
  X,
  XCircle,
} from "lucide-react"
import { toast } from "react-hot-toast"
import ParticipantDetailModal from "./ParticipantDetailModal"
import PairAnalysisModal from "./PairAnalysisModalPro"
import WhatsappMessageModal from "./WhatsappMessageModal"
import {
  buildScoreLookup,
  buildSwapPlans,
  buildUniquePairs,
  getPairCriteriaIssues,
  getPersonName,
  getSeatState,
  isContacted,
  isSeatConfirmed,
  pairKey,
  pairRiskRank,
  scoreFor,
  type MatchControlPair,
  type MatchControlPerson,
  type MatchControlResult,
  type SeatState,
  type SwapPlan,
} from "~/lib/matchControl"

type Props = {
  isOpen: boolean
  onClose: () => void
  results: MatchControlResult[]
  matchType: "ai" | "no-ai" | "group"
  totalMatches: number
  calculatedPairs?: any[]
  onRefresh?: () => Promise<void>
  isFromCache?: boolean
  currentEventId?: number
  isFreshData?: boolean
  matchHistory?: Record<number, any[]>
  cohostTheme?: boolean
  selectedParticipants?: Set<number>
  toggleParticipantSelection?: (assignedNumber: number) => void
  onOpenLegacy?: () => void
}

type PoolMode = "all" | "confirmed" | "paid" | "unpaid"
type PairFilter = "all" | "attention" | "unmatched" | "mixed" | "protected" | "healthy"
type MobileView = "pairs" | "details"
type ChainPaymentScope = "any" | "paid" | "not_paid"

const seatMeta: Record<SeatState, { label: string; short: string; className: string }> = {
  paid: { label: "مدفوع / إيصال معتمد", short: "مدفوع", className: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200" },
  waived: { label: "مقعد مؤكد بإعفاء", short: "إعفاء", className: "border-teal-400/30 bg-teal-500/15 text-teal-200" },
  receipt: { label: "إيصال ينتظر المراجعة", short: "إيصال معلّق", className: "border-amber-400/30 bg-amber-500/15 text-amber-200" },
  confirmed_pending: { label: "حضور مؤكد والدفع معلّق", short: "دفع معلّق", className: "border-orange-400/30 bg-orange-500/15 text-orange-200" },
  declined: { label: "اعتذر عن الحضور", short: "معتذر", className: "border-red-400/30 bg-red-500/15 text-red-200" },
  contacted: { label: "تم التواصل ولم يدفع", short: "تم التواصل", className: "border-blue-400/30 bg-blue-500/15 text-blue-200" },
  unpaid: { label: "غير مدفوع ولم يؤكد المقعد", short: "غير مدفوع", className: "border-slate-500/30 bg-slate-500/10 text-slate-300" },
}

const verdictMeta = {
  recommended: { label: "موصى به", icon: ShieldCheck, className: "border-emerald-400/30 bg-emerald-500/12 text-emerald-200" },
  reasonable: { label: "مقبول مع مراجعة", icon: Info, className: "border-amber-400/30 bg-amber-500/12 text-amber-200" },
  risky: { label: "عالي المخاطر", icon: ShieldAlert, className: "border-red-400/30 bg-red-500/12 text-red-200" },
}

function SeatBadge({ person, compact = false }: { person?: MatchControlPerson; compact?: boolean }) {
  const meta = seatMeta[getSeatState(person)]
  return (
    <span title={meta.label} className={`inline-flex items-center gap-1 rounded-full border font-bold ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"} ${meta.className}`}>
      <CircleDollarSign className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {compact ? meta.short : meta.label}
    </span>
  )
}

function ScorePill({ score, previous }: { score: number | null; previous?: number | null }) {
  const tone = score == null
    ? "border-slate-600/50 bg-slate-800 text-slate-400"
    : score >= 80
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
      : score >= 60
        ? "border-amber-400/30 bg-amber-500/15 text-amber-200"
        : "border-red-400/30 bg-red-500/15 text-red-200"
  const delta = score != null && previous != null ? score - previous : null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-black tabular-nums ${tone}`}>
      {score == null ? "غير محسوب" : `${score}%`}
      {delta != null && delta !== 0 && (
        <span className={delta > 0 ? "text-emerald-300" : "text-red-300"}>{delta > 0 ? `+${delta}` : delta}</span>
      )}
    </span>
  )
}

function PersonButton({
  number,
  person,
  active,
  onClick,
  onIndividual,
}: {
  number: number
  person?: MatchControlPerson
  active?: boolean
  onClick?: () => void
  onIndividual?: () => void
}) {
  return (
    <div className={`min-w-0 flex-1 rounded-2xl border p-2.5 transition ${active ? "border-cyan-400/45 bg-cyan-500/10" : "border-white/8 bg-black/15"}`}>
      <button onClick={onClick} className="flex w-full min-w-0 items-center gap-2 text-right">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black ${active ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-200"}`}>#{number}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-white">{getPersonName(person, number)}</span>
          <span className="mt-1 block"><SeatBadge person={person} compact /></span>
        </span>
      </button>
      {onIndividual && (
        <button onClick={onIndividual} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[10px] font-bold text-slate-300 hover:bg-white/10 hover:text-white">
          <Eye className="h-3 w-3" /> النتائج الفردية
        </button>
      )}
    </div>
  )
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return <button onClick={onClick} className={`whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition ${active ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200" : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07] hover:text-white"}`}>{children}</button>
}

export default function MatchControlCenterModal({
  isOpen,
  onClose,
  results,
  matchType,
  totalMatches,
  calculatedPairs = [],
  onRefresh,
  currentEventId = 1,
  isFreshData = false,
  matchHistory = {},
  cohostTheme = false,
  selectedParticipants,
  toggleParticipantSelection,
  onOpenLegacy,
}: Props) {
  const [people, setPeople] = useState<Map<number, MatchControlPerson>>(new Map())
  const [lockedMatches, setLockedMatches] = useState<any[]>([])
  const [localHistory, setLocalHistory] = useState<Record<number, any[]>>(matchHistory)
  const [loadingData, setLoadingData] = useState(false)
  const [query, setQuery] = useState("")
  const [pool, setPool] = useState<PoolMode>("all")
  const [pairFilter, setPairFilter] = useState<PairFilter>("all")
  const [sortMode, setSortMode] = useState<"priority" | "score" | "number">("priority")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<MobileView>("pairs")
  const [swapSource, setSwapSource] = useState<number | null>(null)
  const [candidateQuery, setCandidateQuery] = useState("")
  const [candidatePool, setCandidatePool] = useState<PoolMode>("all")
  const [candidateMatched, setCandidateMatched] = useState<"all" | "matched" | "unmatched">("all")
  const [chainPaymentScope, setChainPaymentScope] = useState<ChainPaymentScope>("any")
  const [swapTarget, setSwapTarget] = useState<number | null>(null)
  const [chosenPlan, setChosenPlan] = useState<SwapPlan | null>(null)
  const [applying, setApplying] = useState(false)
  const [lastUndo, setLastUndo] = useState<{ pairs: Array<{ a: number; b: number }>; round: number; auditId?: string } | null>(null)
  const [detailParticipant, setDetailParticipant] = useState<{ assigned_number: number; name: string } | null>(null)
  const [detailMatches, setDetailMatches] = useState<any[]>([])
  const [whatsappPerson, setWhatsappPerson] = useState<any | null>(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisData, setAnalysisData] = useState<{ a: any; b: any; pair: any } | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const scoreLookup = useMemo(() => buildScoreLookup(calculatedPairs, results), [calculatedPairs, results])
  const pairs = useMemo(() => buildUniquePairs(results), [results])
  const lockedKeys = useMemo(() => new Set(lockedMatches.map(lock => pairKey(Number(lock.participant1_number), Number(lock.participant2_number)))), [lockedMatches])
  const partnerMap = useMemo(() => {
    const map = new Map<number, number>()
    pairs.forEach(pair => { if (pair.b != null) { map.set(pair.a, pair.b); map.set(pair.b, pair.a) } })
    return map
  }, [pairs])

  const chainEligibleNumbers = useMemo(() => {
    if (chainPaymentScope === "any") return undefined
    return new Set(Array.from(people.values())
      .filter(person => {
        const state = getSeatState(person)
        if (state === "declined") return false
        return chainPaymentScope === "paid" ? state === "paid" : state !== "paid"
      })
      .map(person => person.assigned_number))
  }, [chainPaymentScope, people])

  const hydratePeopleFromResults = useCallback((serverPeople?: MatchControlPerson[]) => {
    const map = new Map<number, MatchControlPerson>()
    for (const person of serverPeople || []) map.set(Number(person.assigned_number), person)
    for (const result of results) {
      const current = map.get(result.assigned_number) || { assigned_number: result.assigned_number }
      map.set(result.assigned_number, {
        ...current,
        name: current.name || result.name,
        PAID_DONE: current.PAID_DONE ?? result.paid_done,
      })
      if (result.partner_assigned_number && result.partner_assigned_number !== 9999) {
        const num = result.partner_assigned_number
        const partner = map.get(num) || { assigned_number: num }
        map.set(num, { ...partner, name: partner.name || result.partner_name, PAID_DONE: partner.PAID_DONE ?? result.partner_paid_done })
      }
    }
    setPeople(map)
  }, [results])

  const fetchControlData = useCallback(async () => {
    setLoadingData(true)
    try {
      const [participantsResponse, locksResponse, historyResponse] = await Promise.all([
        fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "participants", event_id: currentEventId, include_matching_pool: true }) }),
        fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get-locked-matches" }) }),
        Object.keys(matchHistory).length
          ? Promise.resolve(null)
          : fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get-all-match-history", match_id: "00000000-0000-0000-0000-000000000000" }) }),
      ])
      const participantsData = await participantsResponse.json()
      const locksData = await locksResponse.json()
      hydratePeopleFromResults(participantsResponse.ok ? participantsData.participants || [] : [])
      if (locksResponse.ok) setLockedMatches(locksData.lockedMatches || [])
      if (historyResponse) {
        const historyData = await historyResponse.json()
        if (historyResponse.ok && historyData.matchHistory) setLocalHistory(historyData.matchHistory)
      }
    } catch (error) {
      console.error("Failed to load match control data", error)
      hydratePeopleFromResults()
      toast.error("تعذر تحميل بعض بيانات المشاركين، تم عرض النتائج المتاحة")
    } finally {
      setLoadingData(false)
    }
  }, [currentEventId, hydratePeopleFromResults, matchHistory])

  useEffect(() => {
    if (!isOpen) return
    hydratePeopleFromResults()
    fetchControlData()
  }, [isOpen, fetchControlData, hydratePeopleFromResults])

  useEffect(() => {
    if (!pairs.length) { setSelectedKey(null); return }
    if (!selectedKey || !pairs.some(pair => pair.key === selectedKey)) setSelectedKey(pairs[0].key)
  }, [pairs, selectedKey])

  useEffect(() => {
    setLocalHistory(matchHistory)
  }, [matchHistory])

  const selectedPair = useMemo(() => pairs.find(pair => pair.key === selectedKey) || null, [pairs, selectedKey])
  const pairMeetsMatchingCriteria = useCallback((a: number, b: number) => (
    getPairCriteriaIssues(people.get(a), people.get(b), selectedPair?.round || 1).length === 0
  ), [people, selectedPair?.round])

  const poolMatches = useCallback((person?: MatchControlPerson, mode: PoolMode = pool) => {
    if (mode === "all") return getSeatState(person) !== "declined"
    if (mode === "confirmed") return isSeatConfirmed(person)
    if (mode === "paid") return getSeatState(person) === "paid"
    return !isSeatConfirmed(person) && getSeatState(person) !== "declined"
  }, [pool])

  const pairCategory = useCallback((pair: MatchControlPair) => {
    const a = people.get(pair.a)
    const b = pair.b == null ? undefined : people.get(pair.b)
    if (pair.b == null) return "unmatched"
    const aPaymentSettled = ["paid", "waived"].includes(getSeatState(a))
    const bPaymentSettled = ["paid", "waived"].includes(getSeatState(b))
    if (aPaymentSettled !== bPaymentSettled) return "mixed"
    if ((pair.score ?? 0) < 60) return "attention"
    if (lockedKeys.has(pairKey(pair.a, pair.b)) || isContacted(a) || isContacted(b)) return "protected"
    return "healthy"
  }, [lockedKeys, people])

  const visiblePairs = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return pairs
      .filter(pair => {
        const a = people.get(pair.a)
        const b = pair.b == null ? undefined : people.get(pair.b)
        if (normalized) {
          const haystack = `${pair.a} ${pair.b || ""} ${getPersonName(a, pair.a)} ${pair.b ? getPersonName(b, pair.b) : ""}`.toLowerCase()
          if (!haystack.includes(normalized)) return false
        }
        if (pool !== "all" && !poolMatches(a, pool) && !poolMatches(b, pool)) return false
        const category = pairCategory(pair)
        if (pairFilter === "all") return true
        if (pairFilter === "attention") return category === "attention" || category === "unmatched" || category === "mixed"
        return category === pairFilter
      })
      .sort((left, right) => {
        if (sortMode === "score") return (right.score ?? -1) - (left.score ?? -1)
        if (sortMode === "number") return left.a - right.a
        return pairRiskRank(left, people, lockedKeys) - pairRiskRank(right, people, lockedKeys) || (left.score ?? 0) - (right.score ?? 0)
      })
  }, [lockedKeys, pairCategory, pairFilter, pairs, people, pool, poolMatches, query, sortMode])

  const stats = useMemo(() => {
    const confirmedUnmatched = pairs.filter(pair => pair.b == null && isSeatConfirmed(people.get(pair.a))).length
    const mixed = pairs.filter(pair => pairCategory(pair) === "mixed").length
    const protectedPairs = pairs.filter(pair => pair.b != null && (lockedKeys.has(pairKey(pair.a, pair.b)) || isContacted(people.get(pair.a)) || isContacted(people.get(pair.b)))).length
    const confirmed = Array.from(people.values()).filter(isSeatConfirmed).length
    return { confirmedUnmatched, mixed, protectedPairs, confirmed }
  }, [lockedKeys, pairCategory, pairs, people])

  const openIndividual = (number: number) => {
    const participant = people.get(number)
    const matches = calculatedPairs
      .filter(pair => Number(pair.participant_a) === number || Number(pair.participant_b) === number)
      .map(pair => {
        const isA = Number(pair.participant_a) === number
        const other = Number(isA ? pair.participant_b : pair.participant_a)
        return {
          participant_number: other,
          participant_name: getPersonName(people.get(other), other),
          compatibility_score: Math.round(Number(pair.compatibility_score ?? 0)),
          mbti_compatibility_score: pair.mbti_compatibility_score,
          attachment_compatibility_score: pair.attachment_compatibility_score,
          communication_compatibility_score: pair.communication_compatibility_score,
          lifestyle_compatibility_score: pair.lifestyle_compatibility_score,
          core_values_compatibility_score: pair.core_values_compatibility_score,
          vibe_compatibility_score: pair.vibe_compatibility_score,
          synergy_score: pair.synergy_score,
          humor_open_score: pair.humor_open_score,
          intent_score: pair.intent_score,
          intent_self: isA ? pair.intent_a : pair.intent_b,
          intent_other: isA ? pair.intent_b : pair.intent_a,
          attachment_penalty_applied: pair.attachment_penalty_applied,
          intent_boost_applied: pair.intent_boost_applied,
          dead_air_veto_applied: pair.dead_air_veto_applied,
          humor_clash_veto_applied: pair.humor_clash_veto_applied,
          cap_applied: pair.cap_applied,
          reason: pair.reason,
          is_actual_match: partnerMap.get(number) === other,
          is_repeated_match: pair.is_repeated_match,
          humor_early_openness_bonus: pair.humor_early_openness_bonus,
        }
      })
      .sort((a, b) => b.compatibility_score - a.compatibility_score)
    setDetailParticipant({ assigned_number: number, name: getPersonName(participant, number) })
    setDetailMatches(matches)
  }

  const openAnalysis = (pair: MatchControlPair) => {
    if (pair.b == null) return
    setAnalysisData({
      a: people.get(pair.a),
      b: people.get(pair.b),
      pair: scoreLookup.get(pairKey(pair.a, pair.b)) || { compatibility_score: pair.score || 0 },
    })
    setAnalysisOpen(true)
  }

  const openWhatsapp = (number: number) => setWhatsappPerson(people.get(number) || { assigned_number: number, name: getPersonName(undefined, number) })

  const toggleLock = async (pair: MatchControlPair) => {
    if (pair.b == null) return
    const key = pairKey(pair.a, pair.b)
    setBusyAction(`lock-${key}`)
    try {
      const existing = lockedMatches.find(lock => pairKey(Number(lock.participant1_number), Number(lock.participant2_number)) === key)
      const body = existing
        ? { action: "remove-locked-match", id: existing.id }
        : { action: "add-locked-match", participant1: pair.a, participant2: pair.b, compatibilityScore: pair.score || 0, round: pair.round, reason: "Match Control Center" }
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحديث التثبيت")
      await fetchControlData()
      toast.success(existing ? "تم إلغاء تثبيت المطابقة" : "تم تثبيت المطابقة")
    } catch (error: any) {
      toast.error(error.message || "تعذر تحديث التثبيت")
    } finally {
      setBusyAction(null)
    }
  }

  const excludePair = async (pair: MatchControlPair) => {
    if (pair.b == null || !confirm(`استبعاد الزوج #${pair.a} ↔ #${pair.b} من المطابقات المستقبلية؟`)) return
    setBusyAction(`exclude-${pair.key}`)
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add-excluded-pair", participant1: pair.a, participant2: pair.b }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "فشل الاستبعاد")
      toast.success("تم استبعاد الزوج من المطابقات المستقبلية")
    } catch (error: any) {
      toast.error(error.message || "فشل الاستبعاد")
    } finally {
      setBusyAction(null)
    }
  }

  const excludePerson = async (number: number, permanent = false) => {
    const label = permanent ? "حظر نهائي" : "استبعاد مؤقت"
    if (!confirm(`${label} للمشارك #${number}؟`)) return
    setBusyAction(`${permanent ? "ban" : "exclude-person"}-${number}`)
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add-excluded-participant", participantNumber: number, banPermanently: permanent }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `فشل ${label}`)
      toast.success(`تم ${label}`)
    } catch (error: any) {
      toast.error(error.message || `فشل ${label}`)
    } finally {
      setBusyAction(null)
    }
  }

  const startSwap = (number: number) => {
    setSwapSource(number)
    setSwapTarget(null)
    setChosenPlan(null)
    setCandidateQuery("")
    setCandidatePool("all")
    setCandidateMatched("all")
    setChainPaymentScope("any")
    setMobileView("details")
  }

  const candidates = useMemo(() => {
    if (swapSource == null) return []
    const normalized = candidateQuery.trim().toLowerCase()
    return Array.from(people.values())
      .filter(person => person.assigned_number !== swapSource && person.assigned_number !== partnerMap.get(swapSource) && person.assigned_number !== 9999)
      .filter(person => !chainEligibleNumbers || chainEligibleNumbers.has(person.assigned_number))
      .filter(person => poolMatches(person, candidatePool))
      .filter(person => candidateMatched === "all" || (candidateMatched === "matched" ? partnerMap.has(person.assigned_number) : !partnerMap.has(person.assigned_number)))
      .filter(person => !normalized || `${person.assigned_number} ${getPersonName(person, person.assigned_number)}`.toLowerCase().includes(normalized))
      .map(person => {
        const number = person.assigned_number
        const plans = buildSwapPlans({ source: swapSource, target: number, currentPairs: pairs, people, scoreLookup, lockedPairs: lockedKeys, maxDepth: chainPaymentScope === "any" ? 1 : 2, eligibleNumbers: chainEligibleNumbers, isPairEligible: pairMeetsMatchingCriteria })
        return { person, number, score: scoreFor(scoreLookup, swapSource, number), currentPartner: partnerMap.get(number), bestPlan: plans[0] || null }
      })
      .filter(candidate => chainPaymentScope === "any" || candidate.bestPlan != null)
      .sort((a, b) => {
        const verdictRank = { recommended: 0, reasonable: 1, risky: 2 }
        const ar = a.bestPlan ? verdictRank[a.bestPlan.verdict] : 3
        const br = b.bestPlan ? verdictRank[b.bestPlan.verdict] : 3
        return ar - br || (b.score ?? -1) - (a.score ?? -1)
      })
  }, [candidateMatched, candidatePool, candidateQuery, chainEligibleNumbers, chainPaymentScope, lockedKeys, pairMeetsMatchingCriteria, pairs, partnerMap, people, poolMatches, scoreLookup, swapSource])

  const emptyCandidateReasons = useMemo(() => {
    if (swapSource == null || candidates.length) return []
    const reasons: string[] = []
    if (candidateQuery.trim()) reasons.push(`لا توجد نتيجة تطابق البحث «${candidateQuery.trim()}» ضمن النطاق الحالي`)

    if (chainEligibleNumbers) {
      const scopeName = chainPaymentScope === "paid" ? "مدفوع فقط" : "غير مدفوع فقط"
      const sourcePartner = partnerMap.get(swapSource)
      if (!chainEligibleNumbers.has(swapSource)) {
        reasons.push(`المشارك الذي بدأت منه #${swapSource} خارج نطاق «${scopeName}»`)
      }

      const scopedTargets = Array.from(people.values()).filter(person =>
        person.assigned_number !== swapSource &&
        person.assigned_number !== sourcePartner &&
        person.assigned_number !== 9999 &&
        chainEligibleNumbers.has(person.assigned_number)
      )
      if (!scopedTargets.length) reasons.push(`لا يوجد مشارك آخر داخل نطاق «${scopeName}»`)

    }

    if (!reasons.length) reasons.push("لا يوجد هدف يحقق فلاتر العرض وتفضيلات الطرفين ومعايير العمر والجنسية والتفاعل دون إنشاء مطابقة سابقة")
    return reasons
  }, [candidateQuery, candidates.length, chainEligibleNumbers, chainPaymentScope, partnerMap, people, swapSource])

  const plans = useMemo(() => swapSource != null && swapTarget != null
    ? buildSwapPlans({ source: swapSource, target: swapTarget, currentPairs: pairs, people, scoreLookup, lockedPairs: lockedKeys, maxDepth: 2, eligibleNumbers: chainEligibleNumbers, isPairEligible: pairMeetsMatchingCriteria })
    : [], [chainEligibleNumbers, lockedKeys, pairMeetsMatchingCriteria, pairs, people, scoreLookup, swapSource, swapTarget])

  const planBlockers = useMemo(() => {
    if (swapSource == null || swapTarget == null || plans.length) return []
    const blockers: string[] = []
    const scopeLabel = chainPaymentScope === "paid" ? "مدفوع فقط" : "غير مدفوع فقط"
    if (chainEligibleNumbers && !chainEligibleNumbers.has(swapSource)) blockers.push(`المشارك الأساسي #${swapSource} خارج نطاق «${scopeLabel}»`)
    if (chainEligibleNumbers && !chainEligibleNumbers.has(swapTarget)) blockers.push(`المشارك المختار #${swapTarget} خارج نطاق «${scopeLabel}»`)
    blockers.push(...getPairCriteriaIssues(people.get(swapSource), people.get(swapTarget), selectedPair?.round || 1))
    if (scoreLookup.get(pairKey(swapSource, swapTarget))?.is_repeated_match === true) blockers.push("هذا الزوج تقابل في فعالية سابقة")
    if (!blockers.length) blockers.push("لا يمكن إغلاق بقية السلسلة دون كسر تفضيل أو معيار لأحد الأزواج المتأثرين")
    return Array.from(new Set(blockers))
  }, [chainEligibleNumbers, chainPaymentScope, people, plans.length, scoreLookup, selectedPair?.round, swapSource, swapTarget])

  useEffect(() => {
    setChosenPlan(plans[0] || null)
  }, [plans])

  const applyPairs = async (newPairs: Array<{ a: number; b: number }>, round: number, force = true) => {
    for (const pair of newPairs) {
      const response = await fetch("/api/admin/trigger-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: currentEventId,
          manualMatch: { participant1: pair.a, participant2: pair.b, round, bypassEligibility: false, testModeOnly: false, forceSwap: force },
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `فشل إنشاء المطابقة #${pair.a} ↔ #${pair.b}`)
    }
  }

  const preflightPlan = async (plan: SwapPlan, round: number) => {
    for (const pair of plan.afterPairs) {
      const response = await fetch("/api/admin/trigger-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: currentEventId,
          manualMatch: { participant1: pair.a, participant2: pair.b, round, bypassEligibility: false, testModeOnly: true },
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `المطابقة #${pair.a} ↔ #${pair.b} غير مؤهلة`)
    }
  }

  const postAdminAction = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    return { response, data }
  }

  const applyPlanTransaction = async (plan: SwapPlan, round: number) => {
    return postAdminAction({
      action: "apply-match-swap-plan",
      event_id: currentEventId,
      round,
      pairs: plan.afterPairs.map(pair => ({ a: pair.a, b: pair.b })),
      affected: plan.affected,
      expected_pairs: plan.beforePairs.map(pair => ({ a: pair.a, b: pair.b })),
      plan_summary: {
        source: plan.source,
        target: plan.target,
        payment_scope: chainPaymentScope,
        verdict: plan.verdict,
        delta: plan.delta,
        before_min: plan.beforeMin,
        after_min: plan.afterMin,
        unmatched: plan.unmatched,
        reasons: plan.reasons,
      },
    })
  }

  const applyPlan = async () => {
    if (!chosenPlan || !selectedPair) return
    const warnings = [
      chosenPlan.confirmedUnmatched.length ? `${chosenPlan.confirmedUnmatched.length} مقعد مؤكد سيبقى دون شريك` : null,
      chosenPlan.releasedOutsideScope.length ? `${chosenPlan.releasedOutsideScope.length} شريك حالي خارج نطاق الدفع سيتم فك ارتباطه دون إدخاله في السلسلة` : null,
      chosenPlan.brokenLocks ? `${chosenPlan.brokenLocks} مطابقة مثبتة ستتغير` : null,
      chosenPlan.contactedPairsChanged ? `${chosenPlan.contactedPairsChanged} زوج تم التواصل معه سيتغير` : null,
      chosenPlan.repeatedPairs ? `${chosenPlan.repeatedPairs} مطابقة مكررة` : null,
    ].filter(Boolean)
    const scopeLabel = chainPaymentScope === "paid" ? "مدفوع فقط" : chainPaymentScope === "not_paid" ? "غير مدفوع فقط" : "دون قيد دفع"
    const message = `تطبيق خطة التبديل؟\nنطاق السلسلة: ${scopeLabel}\n\n${chosenPlan.afterPairs.map(pair => `#${pair.a} ↔ #${pair.b}`).join("\n")}${warnings.length ? `\n\nتحذيرات:\n• ${warnings.join("\n• ")}` : "\n\nالخطة تنتهي بدون تحذيرات حرجة."}`
    if (!confirm(message)) return

    const undoPairs = chosenPlan.beforePairs.map(pair => ({ a: pair.a, b: pair.b }))
    setApplying(true)
    try {
      const { response, data } = await applyPlanTransaction(chosenPlan, selectedPair.round)
      let auditId: string | undefined

      if (response.ok) {
        auditId = data.audit_id
      } else if (response.status === 501 && data.migration_required) {
        // Compatibility fallback for deployments where the new migration has
        // not reached the database yet. The UI remains usable while retaining
        // the existing preflight and best-effort rollback behavior.
        await preflightPlan(chosenPlan, selectedPair.round)
        try {
          await applyPairs(chosenPlan.afterPairs.map(pair => ({ a: pair.a, b: pair.b })), selectedPair.round)
        } catch (applyError) {
          if (undoPairs.length) {
            try { await applyPairs(undoPairs, selectedPair.round) } catch (rollbackError) { console.error("Swap rollback failed", rollbackError) }
          }
          throw applyError
        }
      } else {
        throw new Error(data.error || "تعذر تطبيق خطة التبديل")
      }

      setLastUndo({ pairs: undoPairs, round: selectedPair.round, auditId })
      setSwapSource(null)
      setSwapTarget(null)
      setChosenPlan(null)
      toast.success("تم تطبيق سلسلة التبديل وتحديث المطابقات")
      if (onRefresh) await onRefresh()
      else await fetchControlData()
    } catch (error: any) {
      toast.error(error.message || "تعذر تطبيق خطة التبديل", { duration: 7000 })
    } finally {
      setApplying(false)
    }
  }

  const undoLast = async () => {
    if (!lastUndo || !confirm("التراجع عن آخر سلسلة تبديل وإعادة الأزواج السابقة؟")) return
    setApplying(true)
    try {
      if (lastUndo.auditId) {
        const { response, data } = await postAdminAction({ action: "undo-match-swap-plan", audit_id: lastUndo.auditId })
        if (!response.ok) {
          if (response.status === 501 && data.migration_required) await applyPairs(lastUndo.pairs, lastUndo.round)
          else throw new Error(data.error || "تعذر التراجع عن التبديل")
        }
      } else {
        await applyPairs(lastUndo.pairs, lastUndo.round)
      }
      setLastUndo(null)
      toast.success("تمت إعادة الأزواج السابقة")
      if (onRefresh) await onRefresh()
      else await fetchControlData()
    } catch (error: any) {
      toast.error(error.message || "تعذر التراجع")
    } finally {
      setApplying(false)
    }
  }

  if (!isOpen) return null

  const selectedA = selectedPair ? people.get(selectedPair.a) : undefined
  const selectedB = selectedPair?.b != null ? people.get(selectedPair.b) : undefined
  const selectedLocked = selectedPair?.b != null && lockedKeys.has(pairKey(selectedPair.a, selectedPair.b))

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-0 backdrop-blur-md sm:p-3 ${cohostTheme ? "bg-rose-950/80" : ""}`} dir="rtl">
      <div className="flex h-[100dvh] w-full max-w-[1500px] flex-col overflow-hidden bg-[#080d18] shadow-2xl sm:h-[96dvh] sm:rounded-[28px] sm:border sm:border-white/10">
        <header className="shrink-0 border-b border-white/10 bg-gradient-to-l from-cyan-500/10 via-transparent to-fuchsia-500/10 px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-950/50">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-black text-white sm:text-xl">مركز إدارة المطابقات</h2>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-200">{matchType === "ai" ? "ذكاء اصطناعي" : "بدون ذكاء اصطناعي"}</span>
                {isFreshData && <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">بيانات محدثة</span>}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-400 sm:text-xs">{pairs.length} زوج/حالة · {people.size} مشارك متاح · الفعالية #{currentEventId}</p>
            </div>
            {lastUndo && (
              <button onClick={undoLast} disabled={applying} className="hidden items-center gap-1.5 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/20 disabled:opacity-50 sm:flex">
                <Undo2 className="h-4 w-4" /> تراجع
              </button>
            )}
            <button onClick={onClose} aria-label="إغلاق" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          </div>

          {onOpenLegacy && (
            <div className="mt-3 grid grid-cols-2 rounded-2xl border border-white/10 bg-black/20 p-1">
              <button className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-black text-slate-950 shadow-lg shadow-cyan-950/30">مركز التحكم الجديد</button>
              <button onClick={onOpenLegacy} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white">عرض النتائج القديم</button>
            </div>
          )}

          <div className="mt-3 grid grid-cols-4 gap-1.5 sm:gap-2">
            <button onClick={() => setPairFilter("unmatched")} className="rounded-xl border border-red-400/15 bg-red-500/8 p-2 text-right hover:bg-red-500/15">
              <div className="text-[9px] text-red-300 sm:text-[10px]">مؤكدون دون شريك</div><div className="text-lg font-black text-white sm:text-xl">{stats.confirmedUnmatched}</div>
            </button>
            <button onClick={() => setPairFilter("mixed")} className="rounded-xl border border-amber-400/15 bg-amber-500/8 p-2 text-right hover:bg-amber-500/15">
              <div className="text-[9px] text-amber-300 sm:text-[10px]">مدفوع + غير مدفوع</div><div className="text-lg font-black text-white sm:text-xl">{stats.mixed}</div>
            </button>
            <button onClick={() => setPairFilter("protected")} className="rounded-xl border border-blue-400/15 bg-blue-500/8 p-2 text-right hover:bg-blue-500/15">
              <div className="text-[9px] text-blue-300 sm:text-[10px]">مثبت/تم التواصل</div><div className="text-lg font-black text-white sm:text-xl">{stats.protectedPairs}</div>
            </button>
            <button onClick={() => setPool("confirmed")} className="rounded-xl border border-emerald-400/15 bg-emerald-500/8 p-2 text-right hover:bg-emerald-500/15">
              <div className="text-[9px] text-emerald-300 sm:text-[10px]">مقاعد مؤكدة</div><div className="text-lg font-black text-white sm:text-xl">{stats.confirmed}</div>
            </button>
          </div>

          <div className="mt-3 flex lg:hidden">
            <button onClick={() => setMobileView("pairs")} className={`flex-1 rounded-r-xl py-2 text-xs font-bold ${mobileView === "pairs" ? "bg-cyan-500 text-slate-950" : "bg-white/5 text-slate-400"}`}>كل الأزواج</button>
            <button onClick={() => setMobileView("details")} disabled={!selectedPair} className={`flex-1 rounded-l-xl py-2 text-xs font-bold ${mobileView === "details" ? "bg-cyan-500 text-slate-950" : "bg-white/5 text-slate-400"}`}>التفاصيل والتبديل</button>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(350px,0.88fr)_minmax(520px,1.5fr)]">
          <section className={`${mobileView === "pairs" ? "flex" : "hidden"} min-h-0 flex-col border-white/10 lg:flex lg:border-l`}>
            <div className="shrink-0 space-y-2 border-b border-white/8 p-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الرقم..." className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pr-9 pl-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/40" />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                <ToggleButton active={pool === "all"} onClick={() => setPool("all")}>الكل</ToggleButton>
                <ToggleButton active={pool === "confirmed"} onClick={() => setPool("confirmed")}>المقاعد المؤكدة</ToggleButton>
                <ToggleButton active={pool === "paid"} onClick={() => setPool("paid")}>مدفوع فقط</ToggleButton>
                <ToggleButton active={pool === "unpaid"} onClick={() => setPool("unpaid")}>غير المدفوع/الاحتياط</ToggleButton>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                <Filter className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                {([[
                  "all", "الكل"
                ], ["attention", "يحتاج انتباه"], ["unmatched", "دون شريك"], ["mixed", "دفع مختلط"], ["protected", "محمي"], ["healthy", "مستقر"]] as Array<[PairFilter, string]>).map(([value, label]) => (
                  <ToggleButton key={value} active={pairFilter === value} onClick={() => setPairFilter(value)}>{label}</ToggleButton>
                ))}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>{visiblePairs.length} ظاهر من {pairs.length}</span>
                <select value={sortMode} onChange={event => setSortMode(event.target.value as any)} className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-slate-300 outline-none">
                  <option value="priority">الأهم أولاً</option><option value="score">الأعلى توافقاً</option><option value="number">حسب الرقم</option>
                </select>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-2.5">
              {loadingData && !people.size && <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل كل المشاركين</div>}
              {!visiblePairs.length && !loadingData && <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">لا توجد نتائج تطابق هذه الفلاتر</div>}
              {visiblePairs.map(pair => {
                const a = people.get(pair.a)
                const b = pair.b == null ? undefined : people.get(pair.b)
                const category = pairCategory(pair)
                const isActive = selectedKey === pair.key
                const protectedPair = pair.b != null && lockedKeys.has(pairKey(pair.a, pair.b))
                return (
                  <button key={pair.key} onClick={() => { setSelectedKey(pair.key); setSwapSource(null); setMobileView("details") }} className={`w-full rounded-2xl border p-3 text-right transition ${isActive ? "border-cyan-400/50 bg-cyan-500/10 shadow-lg shadow-cyan-950/25" : "border-white/8 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.05]"}`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {category === "unmatched" && <span className="rounded-full bg-red-500/15 px-2 py-1 text-[9px] font-bold text-red-300">دون شريك</span>}
                        {category === "mixed" && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[9px] font-bold text-amber-300">دفع مختلط</span>}
                        {protectedPair && <Lock className="h-3.5 w-3.5 text-blue-300" />}
                        {(isContacted(a) || isContacted(b)) && <MessageCircle className="h-3.5 w-3.5 text-blue-300" />}
                      </div>
                      <ScorePill score={pair.score} />
                    </div>
                    <div className="flex items-stretch gap-2">
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-white">{getPersonName(a, pair.a)}</div><div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500"><span>#{pair.a}</span><SeatBadge person={a} compact /></div></div>
                      <ArrowLeftRight className="mt-2 h-4 w-4 shrink-0 text-slate-600" />
                      <div className="min-w-0 flex-1"><div className={`truncate text-sm font-bold ${pair.b == null ? "text-red-300" : "text-white"}`}>{pair.b == null ? "لا يوجد شريك" : getPersonName(b, pair.b)}</div><div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">{pair.b != null && <><span>#{pair.b}</span><SeatBadge person={b} compact /></>}</div></div>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className={`${mobileView === "details" ? "flex" : "hidden"} min-h-0 flex-col lg:flex`}>
            {!selectedPair ? (
              <div className="flex flex-1 flex-col items-center justify-center p-10 text-center"><Users className="mb-4 h-14 w-14 text-slate-700" /><h3 className="font-bold text-white">اختر زوجاً للمراجعة</h3><p className="mt-1 text-sm text-slate-500">ستظهر التفاصيل والبدائل وتأثير أي تبديل هنا.</p></div>
            ) : swapSource != null ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 border-b border-white/8 p-3 sm:p-4">
                  <button onClick={() => { setSwapSource(null); setSwapTarget(null); setChosenPlan(null) }} className="mb-3 flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> العودة لملخص الزوج</button>
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-[10px] font-bold text-cyan-300">تخطيط تبديل للمشارك</p><h3 className="text-lg font-black text-white">{getPersonName(people.get(swapSource), swapSource)} <span className="font-mono text-slate-500">#{swapSource}</span></h3><p className="mt-1 text-xs text-slate-500">تظهر فقط السلاسل التي ينجح كل زوج فيها في تفضيلات الجنس والعمر والجنسية وأسلوب التفاعل ومعايير المطابقة.</p></div>
                    <SeatBadge person={people.get(swapSource)} />
                  </div>
                </div>

                <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(270px,.82fr)_minmax(310px,1.18fr)]">
                  <div className={`${swapTarget == null ? "flex" : "hidden"} min-h-0 flex-col border-white/8 lg:flex lg:border-l`}>
                    <div className="shrink-0 space-y-2 border-b border-white/8 p-3">
                      <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.06] p-2.5">
                        <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] font-black text-cyan-200">نطاق الدفع لكامل سلسلة التبديل</span><span className="text-[9px] text-slate-500">يشمل كل المتأثرين</span></div>
                        <div className="grid grid-cols-3 gap-1">
                          {([['any', 'الجميع'], ['paid', 'مدفوع فقط'], ['not_paid', 'غير مدفوع فقط']] as Array<[ChainPaymentScope, string]>).map(([value, label]) => (
                            <button key={value} onClick={() => { setChainPaymentScope(value); setCandidatePool(value === "paid" ? "paid" : value === "not_paid" ? "unpaid" : "all"); setSwapTarget(null); setChosenPlan(null) }} className={`rounded-xl border px-2 py-2 text-[10px] font-black transition ${chainPaymentScope === value ? "border-cyan-400/45 bg-cyan-500/20 text-cyan-100" : "border-white/8 bg-black/15 text-slate-400 hover:bg-white/5"}`}>{label}</button>
                          ))}
                        </div>
                        <p className="mt-2 text-[9px] leading-4 text-slate-500">يُطبق النطاق على الأزواج الجديدة فقط. الشريك الحالي خارج النطاق يُفك ارتباطه ويظل خارج السلسلة، ولا يمنع استخدام المشاركين داخل النطاق.</p>
                      </div>
                      <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={candidateQuery} onChange={event => setCandidateQuery(event.target.value)} placeholder="ابحث في كل المشاركين..." className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pr-9 pl-3 text-sm text-white outline-none focus:border-cyan-400/40" /></div>
                      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                        <ToggleButton active={candidatePool === "all"} onClick={() => setCandidatePool("all")}>الكل</ToggleButton><ToggleButton active={candidatePool === "confirmed"} onClick={() => setCandidatePool("confirmed")}>مؤكد</ToggleButton><ToggleButton active={candidatePool === "paid"} onClick={() => setCandidatePool("paid")}>مدفوع</ToggleButton><ToggleButton active={candidatePool === "unpaid"} onClick={() => setCandidatePool("unpaid")}>احتياط</ToggleButton>
                      </div>
                      <select value={candidateMatched} onChange={event => setCandidateMatched(event.target.value as any)} className="h-9 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-xs text-slate-300 outline-none"><option value="all">المتطابقون وغير المتطابقين</option><option value="matched">لديه شريك حالياً</option><option value="unmatched">دون شريك حالياً</option></select>
                    </div>
                    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
                      {candidates.map(candidate => {
                        const meta = candidate.bestPlan ? verdictMeta[candidate.bestPlan.verdict] : verdictMeta.risky
                        const Icon = meta.icon
                        return (
                          <button key={candidate.number} onClick={() => setSwapTarget(candidate.number)} className={`w-full rounded-xl border p-2.5 text-right transition ${swapTarget === candidate.number ? "border-cyan-400/45 bg-cyan-500/10" : "border-white/8 bg-white/[0.025] hover:bg-white/[0.055]"}`}>
                            <div className="flex items-center gap-2">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-[11px] font-black text-slate-200">#{candidate.number}</span>
                              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{getPersonName(candidate.person, candidate.number)}</span><span className="mt-1 flex flex-wrap items-center gap-1"><SeatBadge person={candidate.person} compact />{candidate.currentPartner && <span className="text-[9px] text-slate-500">مع #{candidate.currentPartner}</span>}</span></span>
                              <span className="flex flex-col items-end gap-1"><ScorePill score={candidate.score} /><span className={`inline-flex items-center gap-1 text-[9px] font-bold ${candidate.bestPlan?.verdict === "recommended" ? "text-emerald-300" : candidate.bestPlan?.verdict === "risky" ? "text-red-300" : "text-amber-300"}`}><Icon className="h-3 w-3" />{meta.label}</span></span>
                            </div>
                          </button>
                        )
                      })}
                      {!candidates.length && <div className="p-7 text-center"><ShieldAlert className="mx-auto mb-2 h-7 w-7 text-amber-400/60" /><p className="text-xs font-bold text-slate-400">لا توجد سلسلة تطابق النطاق والمعايير</p><ul className="mt-2 list-inside list-disc space-y-1 text-right text-[10px] font-bold leading-5 text-amber-200/70">{emptyCandidateReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
                    </div>
                  </div>

                  <div className={`${swapTarget != null ? "block" : "hidden"} min-h-0 overflow-y-auto p-3 sm:p-4 lg:block`}>
                    {swapTarget == null ? (
                      <div className="flex h-full min-h-56 flex-col items-center justify-center text-center"><Link2 className="mb-3 h-12 w-12 text-slate-700" /><h4 className="font-bold text-white">اختر مشاركاً لعرض نهاية التبديل</h4><p className="mt-1 max-w-sm text-xs leading-6 text-slate-500">ستظهر المطابقة الجديدة، الشركاء الذين سيتم نقلهم، أفضل سلسلة بديلة، ومن سيبقى دون شريك.</p></div>
                    ) : (
                      <div className="space-y-3">
                        <button onClick={() => { setSwapTarget(null); setChosenPlan(null) }} className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white lg:hidden"><ArrowLeft className="h-4 w-4" /> اختيار مشارك آخر</button>
                        <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold text-cyan-300">خطط التبديل المقترحة</p><h4 className="font-black text-white">مع {getPersonName(people.get(swapTarget), swapTarget)} #{swapTarget}</h4></div><span className="text-[10px] text-slate-500">{plans.length} مسارات</span></div>
                        <div className={`rounded-xl border px-3 py-2 text-[10px] font-bold ${chainPaymentScope === "paid" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : chainPaymentScope === "not_paid" ? "border-amber-400/20 bg-amber-500/10 text-amber-200" : "border-white/8 bg-white/[0.025] text-slate-400"}`}>نطاق السلسلة: {chainPaymentScope === "paid" ? "كل المتأثرين مدفوعون" : chainPaymentScope === "not_paid" ? "كل المتأثرين غير مدفوعين" : "كل حالات الدفع مسموحة"}</div>
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                          {plans.map((plan, index) => { const meta = verdictMeta[plan.verdict]; const Icon = meta.icon; return <button key={plan.id} onClick={() => setChosenPlan(plan)} className={`min-w-[190px] rounded-xl border p-2.5 text-right ${chosenPlan?.id === plan.id ? "border-cyan-400/50 bg-cyan-500/10" : "border-white/10 bg-white/[0.025]"}`}><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-slate-500">الخطة {index + 1}</span><span className={`inline-flex items-center gap-1 text-[9px] font-bold ${plan.verdict === "recommended" ? "text-emerald-300" : plan.verdict === "risky" ? "text-red-300" : "text-amber-300"}`}><Icon className="h-3 w-3" />{meta.label}</span></div><p className="mt-1 truncate text-xs font-bold text-white">{plan.title}</p><p className={`mt-1 text-[10px] font-bold ${plan.delta >= 0 ? "text-emerald-300" : "text-red-300"}`}>{plan.delta >= 0 ? "+" : ""}{plan.delta} نقطة · {plan.affected.length} متأثر</p></button> })}
                        </div>
                        {chosenPlan && <PlanPreview plan={chosenPlan} people={people} scoreLookup={scoreLookup} />}
                        {!plans.length && <div className="rounded-2xl border border-dashed border-amber-400/20 bg-amber-500/[0.06] p-5 text-center"><ShieldAlert className="mx-auto mb-2 h-8 w-8 text-amber-300" /><p className="text-xs font-black text-amber-100">لا توجد خطة لهذا الاختيار</p><p className="mt-1 text-[10px] leading-5 text-amber-200/60">السبب الفعلي:</p><ul className="mx-auto mt-2 max-w-xl list-inside list-disc space-y-1 text-right text-[10px] font-bold leading-5 text-amber-100/80">{planBlockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></div>}
                        <button onClick={applyPlan} disabled={!chosenPlan || applying} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-cyan-500 to-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-cyan-950/30 hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-40">{applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} مراجعة التأكيد وتطبيق الخطة</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
                <div className="mx-auto max-w-5xl space-y-4">
                  <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.055] to-white/[0.015] p-3 sm:p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div><p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">المطابقة الحالية</p><h3 className="mt-0.5 text-lg font-black text-white">عرض الزوج والنتائج الفردية</h3></div>
                      <div className="flex items-center gap-2"><ScorePill score={selectedPair.score} />{selectedLocked && <span className="flex items-center gap-1 rounded-full border border-blue-400/25 bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-blue-200"><Lock className="h-3 w-3" /> مثبت</span>}</div>
                    </div>
                    <div className="flex items-stretch gap-2 sm:gap-3">
                      <PersonButton number={selectedPair.a} person={selectedA} onClick={() => startSwap(selectedPair.a)} onIndividual={() => openIndividual(selectedPair.a)} />
                      <div className="flex shrink-0 flex-col items-center justify-center gap-1"><Heart className="h-5 w-5 text-pink-400" /><span className="text-[9px] text-slate-600">مع</span></div>
                      {selectedPair.b != null ? <PersonButton number={selectedPair.b} person={selectedB} onClick={() => startSwap(selectedPair.b!)} onIndividual={() => openIndividual(selectedPair.b!)} /> : <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-red-400/25 bg-red-500/5 p-3 text-center"><UserMinus className="mb-1 h-5 w-5 text-red-300" /><span className="text-xs font-bold text-red-200">لا يوجد شريك</span><button onClick={() => startSwap(selectedPair.a)} className="mt-2 rounded-lg bg-red-500/15 px-2 py-1 text-[10px] font-bold text-red-200">ابحث عن شريك</button></div>}
                    </div>
                    <p className="mt-3 text-center text-[10px] text-slate-500">اضغط على أي شخص لبدء تبديله، أو اختر «النتائج الفردية» لرؤية جميع توافقاته بالتفصيل.</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <ActionCard icon={selectedLocked ? Unlock : Lock} label={selectedLocked ? "إلغاء تثبيت الزوج" : "تثبيت الزوج"} detail="حماية المطابقة أو تحريرها" onClick={() => toggleLock(selectedPair)} disabled={selectedPair.b == null || busyAction === `lock-${selectedPair.key}`} tone="blue" />
                    <ActionCard icon={Brain} label="تحليل الزوج" detail="مقارنة الشخصية والقيود" onClick={() => openAnalysis(selectedPair)} disabled={selectedPair.b == null} tone="purple" />
                    <ActionCard icon={Ban} label="استبعاد الزوج" detail="من المطابقات المستقبلية" onClick={() => excludePair(selectedPair)} disabled={selectedPair.b == null || busyAction === `exclude-${selectedPair.key}`} tone="red" />
                    <ActionCard icon={RefreshCw} label="تحديث البيانات" detail="تحميل حالة قاعدة البيانات" onClick={async () => { if (onRefresh) await onRefresh(); else await fetchControlData() }} tone="cyan" />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {[selectedPair.a, selectedPair.b].filter((num): num is number => num != null).map(number => {
                      const person = people.get(number)
                      return (
                        <div key={number} className="rounded-2xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
                          <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-[11px] font-black text-white">#{number}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-white">{getPersonName(person, number)}</span><span className="mt-1 block"><SeatBadge person={person} compact /></span></span>{toggleParticipantSelection && selectedParticipants && <button onClick={() => toggleParticipantSelection(number)} title="تحديد للتصدير" className={`flex h-8 w-8 items-center justify-center rounded-lg ${selectedParticipants.has(number) ? "bg-cyan-500 text-slate-950" : "bg-white/5 text-slate-500"}`}><Check className="h-4 w-4" /></button>}</div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button onClick={() => openIndividual(number)} className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-500/10 px-2 py-2 text-[11px] font-bold text-blue-200 hover:bg-blue-500/20"><Eye className="h-3.5 w-3.5" /> كل نتائجه</button>
                            <button onClick={() => startSwap(number)} className="flex items-center justify-center gap-1.5 rounded-xl bg-cyan-500/10 px-2 py-2 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/20"><ArrowLeftRight className="h-3.5 w-3.5" /> تبديل</button>
                            <button onClick={() => openWhatsapp(number)} className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 px-2 py-2 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/20"><MessageSquare className="h-3.5 w-3.5" /> واتساب</button>
                            <button onClick={() => excludePerson(number)} className="flex items-center justify-center gap-1.5 rounded-xl bg-orange-500/10 px-2 py-2 text-[11px] font-bold text-orange-200 hover:bg-orange-500/20"><UserMinus className="h-3.5 w-3.5" /> استبعاد</button>
                          </div>
                          <button onClick={() => excludePerson(number, true)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-[10px] font-bold text-red-300/70 hover:bg-red-500/10 hover:text-red-200"><Ban className="h-3 w-3" /> حظر نهائي</button>
                        </div>
                      )
                    })}
                  </div>

                  {selectedPair.b != null && <PairBreakdown pair={scoreLookup.get(pairKey(selectedPair.a, selectedPair.b))} fallbackScore={selectedPair.score} />}
                </div>
              </div>
            )}
          </section>
        </main>

        <footer className="flex shrink-0 items-center justify-between border-t border-white/8 bg-black/20 px-3 py-2 text-[10px] text-slate-500 sm:px-5">
          <span>{totalMatches} نتيجة أصلية · التغييرات لا تُحفظ إلا بعد شاشة التأكيد</span>
          <div className="flex items-center gap-2">{lastUndo && <button onClick={undoLast} className="flex items-center gap-1 text-amber-300 sm:hidden"><Undo2 className="h-3 w-3" /> تراجع</button>}<span className="hidden sm:inline">الجولة: {selectedPair?.round || "—"}</span></div>
        </footer>
      </div>

      <ParticipantDetailModal isOpen={detailParticipant != null} onClose={() => setDetailParticipant(null)} participant={detailParticipant} matches={detailMatches} matchType={matchType} swapMode={false} onSwapSelect={async () => {}} lockedMatches={lockedMatches} cohostTheme={cohostTheme} />
      <WhatsappMessageModal participant={whatsappPerson} isOpen={whatsappPerson != null} onClose={() => setWhatsappPerson(null)} cohostTheme={cohostTheme} allParticipants={Array.from(people.values())} />
      <PairAnalysisModal open={analysisOpen} onOpenChange={setAnalysisOpen} a={analysisData?.a} b={analysisData?.b} pair={analysisData?.pair} historyA={analysisData?.a?.assigned_number ? localHistory[analysisData.a.assigned_number] || [] : []} historyB={analysisData?.b?.assigned_number ? localHistory[analysisData.b.assigned_number] || [] : []} currentEventId={currentEventId} />
    </div>
  )
}

function ActionCard({ icon: Icon, label, detail, onClick, disabled, tone }: { icon: any; label: string; detail: string; onClick: () => void; disabled?: boolean; tone: "blue" | "purple" | "red" | "cyan" }) {
  const tones = { blue: "text-blue-300 bg-blue-500/10", purple: "text-purple-300 bg-purple-500/10", red: "text-red-300 bg-red-500/10", cyan: "text-cyan-300 bg-cyan-500/10" }
  return <button onClick={onClick} disabled={disabled} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-right hover:bg-white/[0.055] disabled:cursor-not-allowed disabled:opacity-35"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></span><span><span className="block text-xs font-black text-white">{label}</span><span className="mt-0.5 block text-[10px] text-slate-500">{detail}</span></span></button>
}

function PlanPreview({ plan, people, scoreLookup }: { plan: SwapPlan; people: Map<number, MatchControlPerson>; scoreLookup: Map<string, any> }) {
  const meta = verdictMeta[plan.verdict]
  const Icon = meta.icon
  return (
    <div className="space-y-3">
      <div className={`rounded-2xl border p-3 ${meta.className}`}>
        <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-black"><Icon className="h-4 w-4" />{meta.label}</span><span className={`flex items-center gap-1 text-xs font-black ${plan.delta >= 0 ? "text-emerald-300" : "text-red-300"}`}>{plan.delta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}{plan.delta >= 0 ? "+" : ""}{plan.delta} نقطة</span></div>
        <ul className="mt-2 space-y-1 text-[10px] leading-5 opacity-90">{plan.reasons.slice(0, 5).map(reason => <li key={reason}>• {reason}</li>)}</ul>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl border border-red-400/15 bg-red-500/5 p-3"><p className="mb-2 text-[10px] font-black text-red-300">قبل</p>{plan.beforePairs.map(pair => <PlanPairRow key={pairKey(pair.a, pair.b)} pair={pair} people={people} pairData={scoreLookup.get(pairKey(pair.a, pair.b))} old />)}</div>
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/5 p-3"><p className="mb-2 text-[10px] font-black text-emerald-300">بعد</p>{plan.afterPairs.map((pair, index) => <PlanPairRow key={`${pairKey(pair.a, pair.b)}-${index}`} pair={pair} people={people} pairData={scoreLookup.get(pairKey(pair.a, pair.b))} />)}{plan.unmatched.map(number => <div key={number} className={`mt-1 flex items-center justify-between rounded-lg border px-2 py-2 text-[10px] ${isSeatConfirmed(people.get(number)) ? "border-red-400/25 bg-red-500/10 text-red-200" : "border-slate-600/30 bg-slate-800/50 text-slate-400"}`}><span>#{number} {getPersonName(people.get(number), number)}</span><span className="font-black">دون شريك</span></div>)}{plan.releasedOutsideScope.map(number => <div key={`released-${number}`} className="mt-1 flex items-center justify-between rounded-lg border border-slate-600/30 bg-slate-800/50 px-2 py-2 text-[10px] text-slate-400"><span>#{number} {getPersonName(people.get(number), number)}</span><span className="font-black">فُك ارتباطه · خارج النطاق</span></div>)}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center"><Metric label="أضعف زوج" before={plan.beforeMin} after={plan.afterMin} /><Metric label="مؤكدون دون شريك" after={plan.confirmedUnmatched.length} /><Metric label="المتأثرون" after={plan.affected.length} /></div>
    </div>
  )
}

function PlanPairRow({ pair, people, pairData, old = false }: { pair: { a: number; b: number; score: number | null }; people: Map<number, MatchControlPerson>; pairData?: any; old?: boolean }) {
  return <div className="mb-1 flex items-center gap-1.5 rounded-lg bg-black/20 px-2 py-2 text-[10px]"><PairScoreName number={pair.a} other={pair.b} people={people} pairData={pairData} fallbackScore={pair.score} align="right" /><ArrowLeftRight className={`h-3 w-3 shrink-0 ${old ? "text-red-300" : "text-emerald-300"}`} /><PairScoreName number={pair.b} other={pair.a} people={people} pairData={pairData} fallbackScore={pair.score} align="left" /><span className="shrink-0 font-black text-white">{pair.score == null ? "؟" : `${pair.score}%`}</span></div>
}

function PairScoreName({ number, other, people, pairData, fallbackScore, align }: { number: number; other: number; people: Map<number, MatchControlPerson>; pairData?: any; fallbackScore: number | null; align: "right" | "left" }) {
  const total = Number(pairData?.compatibility_score ?? pairData?.total_compatibility_score ?? fallbackScore)
  const metrics = [
    ["Vibe", pairData?.vibe_compatibility_score ?? pairData?.vibe_score],
    ["نمط الحياة", pairData?.lifestyle_compatibility_score ?? pairData?.lifestyle_score],
    ["الدعابة/الانفتاح", pairData?.humor_open_score ?? pairData?.humor_open_compatibility_score],
  ] as const
  const adjustments = [
    pairData?.humor_early_openness_bonus === "full" ? "مكافأة دعابة/انفتاح كاملة" : pairData?.humor_early_openness_bonus === "partial" ? "مكافأة دعابة/انفتاح جزئية" : null,
    Number(pairData?.humor_multiplier) > 1 ? `مضاعف الدعابة ×${Number(pairData.humor_multiplier).toFixed(2)}` : null,
    pairData?.intent_boost_applied ? "مكافأة توافق الهدف مطبقة" : null,
    pairData?.attachment_penalty_applied ? "خصم نمط التعلق مطبق" : null,
    pairData?.dead_air_veto_applied ? "تحذير صمت/تفاعل مطبق" : null,
    pairData?.humor_clash_veto_applied ? "تحذير تعارض الدعابة مطبق" : null,
    pairData?.cap_applied ? `تم تحديد السقف عند ${pairData.cap_applied}%` : null,
  ].filter((item): item is string => Boolean(item))
  return (
    <span className="group relative min-w-0 flex-1">
      <button type="button" className="block w-full truncate rounded px-1 text-right text-slate-200 underline decoration-dotted decoration-slate-600 underline-offset-2 outline-none hover:text-cyan-200 focus:text-cyan-200" aria-label={`عرض توافق ${getPersonName(people.get(number), number)} مع ${getPersonName(people.get(other), other)}`}>#{number} {getPersonName(people.get(number), number)}</button>
      <span role="tooltip" className={`pointer-events-none invisible absolute bottom-full z-40 mb-2 w-[min(280px,calc(100vw-3rem))] rounded-2xl border border-cyan-400/25 bg-[#07111f]/98 p-3 text-right opacity-0 shadow-2xl shadow-black/60 backdrop-blur-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${align === "right" ? "right-0" : "left-0"}`}>
        <span className="flex items-start justify-between gap-3"><span><span className="block text-[10px] font-black text-white">{getPersonName(people.get(number), number)}</span><span className="mt-0.5 block text-[9px] text-slate-400">توافقه مع {getPersonName(people.get(other), other)} #{other}</span></span><span className="text-sm font-black text-cyan-200">{Number.isFinite(total) ? `${Math.round(total)}%` : "غير محسوب"}</span></span>
        <span className="mt-3 grid grid-cols-3 gap-1.5">{metrics.map(([label, value]) => <span key={label} className="rounded-xl border border-white/8 bg-white/[0.04] p-2 text-center"><span className="block text-[8px] text-slate-400">{label}</span><span className="mt-1 block text-xs font-black text-white">{Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "—"}</span></span>)}</span>
        {adjustments.length ? <span className="mt-2 block rounded-xl border border-amber-400/15 bg-amber-500/[0.07] p-2"><span className="block text-[8px] font-black text-amber-200">المكافآت والتعديلات</span>{adjustments.map(item => <span key={item} className="mt-1 block text-[9px] leading-4 text-amber-100/80">• {item}</span>)}</span> : <span className="mt-2 block text-[9px] text-slate-500">لا توجد مكافآت أو خصومات مسجلة لهذا الزوج.</span>}
      </span>
    </span>
  )
}

function Metric({ label, before, after }: { label: string; before?: number | null; after?: number | null }) {
  return <div className="rounded-xl border border-white/8 bg-white/[0.025] p-2"><p className="text-[9px] text-slate-500">{label}</p><p className="mt-1 text-sm font-black text-white">{before != null && <span className="text-slate-500 line-through">{before}</span>} {after ?? "—"}{label === "أضعف زوج" && after != null ? "%" : ""}</p></div>
}

function PairBreakdown({ pair, fallbackScore }: { pair: any; fallbackScore: number | null }) {
  const metrics = [
    ["التفاعل", pair?.synergy_score], ["نمط الحياة", pair?.lifestyle_compatibility_score], ["الدعابة/الانفتاح", pair?.humor_open_score], ["التواصل", pair?.communication_compatibility_score], ["الأهداف", pair?.intent_score], ["الطاقة", pair?.vibe_compatibility_score],
  ]
  return <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3 sm:p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-purple-300" /><span className="text-xs font-black text-white">تفصيل نتيجة الزوج</span></div><ScorePill score={pair?.compatibility_score != null ? Math.round(Number(pair.compatibility_score)) : fallbackScore} /></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{metrics.map(([label, value]) => <div key={String(label)} className="rounded-xl bg-black/20 p-2 text-center"><div className="text-[9px] text-slate-500">{label}</div><div className="mt-1 text-sm font-black text-slate-200">{Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "—"}</div></div>)}</div>{pair?.reason && <p className="mt-3 rounded-xl border border-white/5 bg-black/20 p-2 text-[10px] leading-5 text-slate-400">{pair.reason}</p>}</div>
}
