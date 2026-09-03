import { useState, useEffect, useMemo, useCallback } from "react"
import { X, Users, Heart, Trophy, Star, Eye, ArrowUpDown, CheckCircle, XCircle, AlertTriangle, Zap, Brain, MessageCircle, Home, DollarSign, Info, Lock, Unlock, MessageSquare, Ban, UserX, Sparkles, Flame, Square, CheckSquare, Search } from "lucide-react"
import { toast } from "react-hot-toast"
import ParticipantDetailModal from "./ParticipantDetailModal"
import WhatsappMessageModal from "./WhatsappMessageModal"
import PairAnalysisModal from "./PairAnalysisModalPro"
import * as Tooltip from "@radix-ui/react-tooltip"
import * as Dialog from "@radix-ui/react-dialog"
import ParticipantHoverCardContent from "./ParticipantHoverCard"
import { HistoryConfidenceBadges } from "./HistoryConfidenceBadge"
import { buildScoreLookup, getPairMatchInsightsCoverage, isContactedUnpaidFemale, pairKey } from "../lib/matchControl"
import {
  compatibilityTotalForDisplay,
  currentBalancedDimensionsForDisplay,
  currentOppositesDimensionsForDisplay,
  isCurrentOppositesScoreRow,
  isSupportedCurrentScoreRow,
} from "../lib/compatibility-model"
const shadowMetrics = [
  { id: "expression_language", label: "لغة", max: 5 },
  { id: "social_relationship_style", label: "اجتماعي", max: 4 },
  { id: "minimum_partner_religious_commitment", label: "التزام", max: 4 },
] as const

function communicationScoreForDisplay(row: any): number | undefined {
  const current = currentBalancedDimensionsForDisplay(row)?.find(dimension => dimension.key === "communication")?.value
  if (current !== null && current !== undefined) return current
  const stored = Number(row?.communication_compatibility_score ?? row?.communication_score)
  return Number.isFinite(stored) ? stored : undefined
}

interface ParticipantResult {
  id: string
  assigned_number: number
  name: string
  compatibility_score: number
  mbti_compatibility_score?: number
  attachment_compatibility_score?: number
  communication_compatibility_score?: number
  lifestyle_compatibility_score?: number
  core_values_compatibility_score?: number
  vibe_compatibility_score?: number
  // New model fields (optional)
  synergy_score?: number
  humor_open_score?: number
  intent_score?: number
  disagreement_style_score?: number
  current_life_overlap_score?: number
  similarity_preference_score?: number
  attachment_pace_score?: number
  attachment_penalty_applied?: boolean
  intent_boost_applied?: boolean
  dead_air_veto_applied?: boolean
  humor_clash_detected?: boolean
  humor_clash_veto_applied?: boolean
  humor_multiplier?: number
  cap_applied?: number | null
  partner_assigned_number?: number
  partner_name?: string
  is_organizer_match?: boolean
  incompatibility_reason?: string
  failed_hard_gates?: Array<{ key?: string; label?: string; detail?: string }>
  included_despite_hard_gates?: boolean
  passes_all_hard_gates?: boolean
  paid_done?: boolean
  partner_paid_done?: boolean
  humor_early_openness_bonus?: 'full' | 'partial' | 'none'
  round?: number | null
  score_model_version?: string
  score_content_hash?: string | null
  score_breakdown?: Record<string, unknown> | null
  question_scores?: Record<string, unknown> | null
  score_snapshot?: Record<string, unknown> | null
  score_provenance_valid?: boolean
  reason?: string
}

type ResultSortKey =
  | "assigned_number"
  | "name"
  | "partner"
  | "compatibility_score"
  | "synergy_score"
  | "disagreement_style_score"
  | "current_life_overlap_score"
  | "similarity_preference_score"
  | "attachment_pace_score"
  | "lifestyle_compatibility_score"
  | "humor_open_score"
  | "communication_compatibility_score"
  | "core_values_compatibility_score"
  | "intent_score"
  | "vibe_compatibility_score"
  | "compound_lifestyle_score"

type SortDirection = "asc" | "desc"

interface ParticipantResultsModalProps {
  isOpen: boolean
  onClose: () => void
  results: ParticipantResult[]
  matchType: "ai" | "no-ai" | "group"
  totalMatches: number
  calculatedPairs?: any[]
  onRefresh?: () => Promise<void>
  isFromCache?: boolean
  sessionId?: string | null
  sessionInfo?: {
    created_at: string
    generation_type: string
    generation_duration_ms?: number
    cache_hit_rate?: number
    ai_calls_made?: number
  } | null
  currentEventId?: number
  isFreshData?: boolean // NEW: Indicates if this is fresh database data (post-swap)
  matchHistory?: Record<number, any[]>
  cohostTheme?: boolean
  selectedParticipants?: Set<number>
  toggleParticipantSelection?: (assignedNumber: number) => void
  onOpenControlCenter?: () => void
}

function MatchInsightsCoverageBadge({ pair }: { pair?: any }) {
  const coverage = getPairMatchInsightsCoverage(pair)
  const meta = coverage.status === "both"
    ? { label: "الأسئلة الجديدة 2/2", className: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200" }
    : coverage.status === "mixed"
      ? { label: "الأسئلة الجديدة 1/2", className: "border-amber-400/30 bg-amber-500/15 text-amber-200" }
      : coverage.status === "neither"
        ? { label: "الأسئلة الجديدة 0/2", className: "border-slate-500/30 bg-slate-500/10 text-slate-300" }
        : { label: "حسبة سابقة", className: "border-violet-400/25 bg-violet-500/10 text-violet-200" }
  const completed = [
    coverage.completeA ? coverage.participantA : null,
    coverage.completeB ? coverage.participantB : null,
  ].filter((number): number is number => number != null)
  const title = coverage.status === "untracked"
    ? "لا توجد لقطة محفوظة لحالة الأسئلة وقت هذه الحسبة. أعد تشغيل المطابقة لإظهار الحالة بدقة."
    : `وقت الحساب: #${coverage.participantA ?? "؟"} أجاب ${coverage.answeredA ?? 0}/${coverage.totalQuestions}، و#${coverage.participantB ?? "؟"} أجاب ${coverage.answeredB ?? 0}/${coverage.totalQuestions}.${coverage.status === "mixed" ? ` المكتمل: #${completed[0] ?? "؟"}.` : ""}`
  return <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[9px] font-bold ${meta.className}`}><Sparkles className="h-2.5 w-2.5" />{meta.label}</span>
}

function parseShadowAnswer(pData: any, key: string): number | null {
  if (!pData) return null
  const surveyData = pData.survey_data || {}
  const source = (surveyData.answers?.[key] ?? pData[key])
  const raw = String(source || "")
  const num = Number.parseInt(raw, 10)
  return Number.isFinite(num) ? num : null
}

function scoreByDistance(aRaw: number | null, bRaw: number | null, max: number): number | null {
  if (aRaw == null || bRaw == null) return null
  const a = Number(aRaw)
  const b = Number(bRaw)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const diff = Math.abs(a - b)
  const normalized = Math.max(0, 1 - (diff / (max - 1)))
  return Math.max(0, Math.min(1, normalized))
}

function buildShadowBadges(p1: number, p2: number | undefined | null, participantData: Map<number, any>) {
  const fallback = {
    expression_language: null,
    social_relationship_style: null,
    minimum_partner_religious_commitment: null,
    overall: null,
  } as Record<string, number | null>
  if (!p2 || p2 === 9999) return fallback
  const a = participantData.get(p1) || {}
  const b = participantData.get(p2) || {}
  const scores: Record<string, number | null> = {}
  const values: number[] = []
  for (const metric of shadowMetrics) {
    const s = scoreByDistance(
      parseShadowAnswer(a, metric.id),
      parseShadowAnswer(b, metric.id),
      metric.max
    )
    scores[metric.id] = s == null ? null : Math.round(s * 100)
    if (s != null) values.push(s)
  }
  const overall = values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100)
  return { ...scores, overall }
}

export default function ParticipantResultsModal({ 
  isOpen, 
  onClose, 
  results, 
  matchType, 
  totalMatches,
  calculatedPairs = [],
  onRefresh,
  isFromCache = false,
  sessionId = null,
  sessionInfo = null,
  currentEventId = 1,
  isFreshData = false,
  matchHistory = {},
  cohostTheme = false,
  selectedParticipants,
  toggleParticipantSelection,
  onOpenControlCenter,
}: ParticipantResultsModalProps) {
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedParticipant, setSelectedParticipant] = useState<{assigned_number: number, name: string} | null>(null)
  const [participantMatches, setParticipantMatches] = useState<any[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [lockedMatches, setLockedMatches] = useState<any[]>([])
  const [loadingLock, setLoadingLock] = useState<number | null>(null)
  const [participantData, setParticipantData] = useState<Map<number, any>>(new Map())
  const [whatsappParticipant, setWhatsappParticipant] = useState<any | null>(null)
  const [showWhatsappModal, setShowWhatsappModal] = useState(false)
  const [localMatchHistory, setLocalMatchHistory] = useState<Record<number, any[]>>(matchHistory)
  const [loadingModalHistory, setLoadingModalHistory] = useState(false)
  // Analysis modal state
  const [showPairAnalysis, setShowPairAnalysis] = useState(false)
  const [analysisA, setAnalysisA] = useState<any | null>(null)
  const [analysisB, setAnalysisB] = useState<any | null>(null)
  const [analysisPair, setAnalysisPair] = useState<any | null>(null)
  // Track participants marked as messaged during this modal session
  const [messageSentSet, setMessageSentSet] = useState<Set<number>>(new Set())
  // Filters: temporarily hide messaged / paid participants (two-way by pair)
  const [hideMessaged, setHideMessaged] = useState(false)
  const [hidePaid, setHidePaid] = useState(false)
  const [showNewOnly, setShowNewOnly] = useState(false)
  const [showPaidOnly, setShowPaidOnly] = useState(false)
  const [showUnmessagedFemalesOnly, setShowUnmessagedFemalesOnly] = useState(false)
  const [showContactedUnpaidFemalesOnly, setShowContactedUnpaidFemalesOnly] = useState(false)
  const [resultQuery, setResultQuery] = useState("")
  const [attendanceFilter, setAttendanceFilter] = useState<"all" | "confirmed" | "declined" | "pending" | "arrived">("all")
  const [resultSortKey, setResultSortKey] = useState<ResultSortKey>("compatibility_score")
  const [resultSortDirection, setResultSortDirection] = useState<SortDirection>("desc")
  const [bulkExcludingUnpaidGirls, setBulkExcludingUnpaidGirls] = useState(false)
  // Impressions: map of participant_number -> Impression[]
  const [impressionsMap, setImpressionsMap] = useState<Record<number, any[]>>({})
  const [impressionsLoaded, setImpressionsLoaded] = useState(false)

  // Fetch match history for all participants in modal
  const fetchAllMatchHistoryForModal = async () => {
    if (Object.keys(localMatchHistory).length > 0) return // Already loaded
    
    setLoadingModalHistory(true)
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "get-all-match-history",
          match_id: "00000000-0000-0000-0000-000000000000"
        }),
      })
      const data = await res.json()
      
      if (data.success && data.matchHistory) {
        setLocalMatchHistory(data.matchHistory)
      }
    } catch (error) {
      console.error("Error fetching match history for modal:", error)
    } finally {
      setLoadingModalHistory(false)
    }
  }

  // Update local match history when prop changes or when it's fetched
  useEffect(() => {
    if (Object.keys(matchHistory).length > 0) {
      setLocalMatchHistory(matchHistory)
    }
  }, [matchHistory])

  // Ensure localMatchHistory updates after fetching
  useEffect(() => {
    if (!loadingModalHistory && Object.keys(localMatchHistory).length === 0 && isOpen) {
      // Try fetching if modal is open and history is empty
      fetchAllMatchHistoryForModal()
    }
  }, [isOpen])

  // Fetch locked matches and participant data when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchAllMatchHistoryForModal()
      fetchLockedMatches()
      fetchParticipantData()
      fetchAllImpressions()
    }
  }, [isOpen])

  const fetchLockedMatches = async () => {
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-locked-matches" })
      })
      const data = await response.json()
      if (response.ok) {
        setLockedMatches(data.lockedMatches || [])
      }
    } catch (error) {
      console.error("Error fetching locked matches:", error)
    }
  }

  const fetchParticipantData = async () => {
    try {
      // Get unique participant numbers from results
      const participantNumbers = new Set<number>()
      results.forEach(r => {
        participantNumbers.add(r.assigned_number)
        if (r.partner_assigned_number && r.partner_assigned_number !== 9999) {
          participantNumbers.add(r.partner_assigned_number)
        }
      })

      // Fetch all participants data using POST with action
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "participants" })
      })
      const data = await response.json()
      
      if (response.ok && data.participants) {
        const dataMap = new Map()
        data.participants.forEach((p: any) => {
          if (participantNumbers.has(p.assigned_number)) {
            dataMap.set(p.assigned_number, p)
          }
        })
        setParticipantData(dataMap)
      }
    } catch (error) {
      console.error("Error fetching participant data:", error)
    }
  }

  const fetchAllImpressions = useCallback(async () => {
    if (impressionsLoaded) return
    const nums = new Set<number>()
    results.forEach(r => {
      nums.add(r.assigned_number)
      if (r.partner_assigned_number && r.partner_assigned_number !== 9999) nums.add(r.partner_assigned_number)
    })
    if (nums.size === 0) return

    const BATCH = 8
    const arr = Array.from(nums)
    const newMap: Record<number, any[]> = {}

    for (let i = 0; i < arr.length; i += BATCH) {
      const batch = arr.slice(i, i + BATCH)
      await Promise.all(batch.map(async (num) => {
        try {
          const res = await fetch("/api/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "get-impressions", participant_number: num }),
          })
          const data = await res.json()
          if (data.success && data.impressions && data.impressions.length > 0) {
            newMap[num] = data.impressions
          }
        } catch { /* skip */ }
      }))
    }

    setImpressionsMap(newMap)
    setImpressionsLoaded(true)
  }, [results, impressionsLoaded])

  const isMessageSent = (assignedNumber: number): boolean => {
    return messageSentSet.has(assignedNumber) || !!participantData.get(assignedNumber)?.PAID
  }

  const markMessageSent = async (participantNumber: number) => {
    if (isMessageSent(participantNumber)) return
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-message-status', participantNumber, newStatus: true })
      })
      if (response.ok) {
        setMessageSentSet(prev => new Set([...prev, participantNumber]))
        toast.success(`#${participantNumber} marked as messaged`)
      }
    } catch (e) {
      console.error('Error marking as sent:', e)
    }
  }

  const isMatchLocked = (participant1: number, participant2: number) => {
    return lockedMatches.some(lock => 
      (lock.participant1_number === participant1 && lock.participant2_number === participant2) ||
      (lock.participant1_number === participant2 && lock.participant2_number === participant1)
    )
  }

  const handleLockMatch = async (participant: ParticipantResult) => {
    if (!participant.partner_assigned_number || participant.partner_assigned_number === 9999) return
    
    setLoadingLock(participant.assigned_number)
    
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "add-locked-match",
          participant1: participant.assigned_number,
          participant2: participant.partner_assigned_number,
          compatibilityScore: resultTotalForDisplay(participant),
          round: participant.round ?? 1,
          reason: "Admin locked from results modal"
        })
      })
      
      const data = await response.json()
      if (response.ok) {
        await fetchLockedMatches() // Refresh locked matches
      } else {
        console.error("Error locking match:", data.error)
      }
    } catch (error) {
      console.error("Error locking match:", error)
    } finally {
      setLoadingLock(null)
    }
  }

  const handleUnlockMatch = async (participant: ParticipantResult) => {
    if (!participant.partner_assigned_number) return
    
    setLoadingLock(participant.assigned_number)
    
    try {
      const lockedMatch = lockedMatches.find(lock => 
        (lock.participant1_number === participant.assigned_number && lock.participant2_number === participant.partner_assigned_number) ||
        (lock.participant1_number === participant.partner_assigned_number && lock.participant2_number === participant.assigned_number)
      )
      
      if (lockedMatch) {
        const response = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            action: "remove-locked-match",
            id: lockedMatch.id
          })
        })
        
        const data = await response.json()
        if (response.ok) {
          await fetchLockedMatches() // Refresh locked matches
        } else {
          console.error("Error unlocking match:", data.error)
        }
      }
    } catch (error) {
      console.error("Error unlocking match:", error)
    } finally {
      setLoadingLock(null)
    }
  }

  const handleExcludePair = async (participant1: number, participant2: number) => {
    if (!confirm(`هل أنت متأكد من استبعاد هذا الزوج؟\n\n#${participant1} ↔ #${participant2}\n\nلن يتم مطابقتهما في الأجيال المستقبلية.`)) {
      return
    }
    
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "add-excluded-pair",
          participant1: participant1,
          participant2: participant2
        })
      })
      
      const data = await response.json()
      if (response.ok) {
        alert(`✅ تم استبعاد الزوج بنجاح!\n\n#${participant1} ↔ #${participant2}\n\nلن يتم مطابقتهما في المستقبل.`)
        
        // Refresh if callback provided
        if (onRefresh) {
          await onRefresh()
        }
      } else {
        alert(`❌ فشل الاستبعاد: ${data.error}`)
      }
    } catch (error) {
      console.error("Error excluding pair:", error)
      alert("❌ حدث خطأ أثناء استبعاد الزوج")
    }
  }

  const handleExcludeParticipant = async (participantNumber: number, participantName: string) => {
    if (!confirm(`هل أنت متأكد من استبعاد هذا المشارك من جميع المطابقات؟\n\n#${participantNumber} - ${participantName}\n\nسيتم استبعاده من المطابقات المستقبلية (يمكن إلغاء الاستبعاد لاحقاً).`)) {
      return
    }
    
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "add-excluded-participant",
          participantNumber: participantNumber,
          banPermanently: false
        })
      })
      
      const data = await response.json()
      if (response.ok) {
        alert(`✅ تم استبعاد المشارك بنجاح!\n\n#${participantNumber} - ${participantName}\n\nلن يتم مطابقته في الأجيال المستقبلية.`)
        
        // Refresh if callback provided
        if (onRefresh) {
          await onRefresh()
        }
      } else {
        alert(`❌ فشل الاستبعاد: ${data.error}`)
      }
    } catch (error) {
      console.error("Error excluding participant:", error)
      alert("❌ حدث خطأ أثناء استبعاد المشارك")
    }
  }

  const handleBanParticipant = async (participantNumber: number, participantName: string) => {
    if (!confirm(`⚠️ هل أنت متأكد من حظر هذا المشارك نهائياً؟\n\n#${participantNumber} - ${participantName}\n\nسيتم حظره نهائياً ولن يتمكن من المشاركة أبداً (حظر دائم).`)) {
      return
    }
    
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "add-excluded-participant",
          participantNumber: participantNumber,
          banPermanently: true
        })
      })
      
      const data = await response.json()
      if (response.ok) {
        alert(`✅ تم حظر المشارك بنجاح!\n\n#${participantNumber} - ${participantName}\n\nتم حظره نهائياً من جميع المطابقات.`)
        
        // Refresh if callback provided
        if (onRefresh) {
          await onRefresh()
        }
      } else {
        alert(`❌ فشل الحظر: ${data.error}`)
      }
    } catch (error) {
      console.error("Error banning participant:", error)
      alert("❌ حدث خطأ أثناء حظر المشارك")
    }
  }

  const pairScoreLookup = useMemo(() => {
    const lookup = buildScoreLookup(calculatedPairs, results)
    // Normalize once per payload, rather than cloning the same pair repeatedly
    // during sorting, table rendering, badges, and hover construction.
    for (const [key, pair] of lookup) {
      const normalizedDeadAir = !!(pair?.dead_air_veto_applied || pair?.deadAirVetoApplied || pair?.deadAirVeto)
      if (pair && pair.dead_air_veto_applied !== normalizedDeadAir) {
        lookup.set(key, { ...pair, dead_air_veto_applied: normalizedDeadAir })
      }
    }
    return lookup
  }, [calculatedPairs, results])

  const getResultPairData = useCallback((participant: ParticipantResult) => {
    const partner = Number(participant.partner_assigned_number)
    if (!Number.isFinite(partner) || partner <= 0 || partner === 9999) return undefined
    return pairScoreLookup.get(pairKey(participant.assigned_number, partner))
  }, [pairScoreLookup])

  const pairTotalLookup = useMemo(() => {
    const totals = new Map<string, number | null>()
    for (const [key, pair] of pairScoreLookup) totals.set(key, compatibilityTotalForDisplay(pair))
    return totals
  }, [pairScoreLookup])

  const resultTotalForDisplay = useCallback((participant: ParticipantResult) => {
    const partner = Number(participant.partner_assigned_number)
    const total = Number.isFinite(partner) && partner > 0 && partner !== 9999
      ? pairTotalLookup.get(pairKey(participant.assigned_number, partner)) ?? null
      : compatibilityTotalForDisplay(participant)
    if (total !== null) return total
    const direct = Number(participant.compatibility_score)
    return Number.isFinite(direct) ? direct : 0
  }, [pairTotalLookup])

  if (!isOpen) return null

  // Remove duplicates and sort results by compatibility score (descending)
  // For individual matching, only show each participant once (keep the higher score if duplicated)
  let processedResults = results
  
  if (matchType !== "group") {
    const participantMap = new Map()
    
    results.forEach(result => {
      const existing = participantMap.get(result.assigned_number)
      if (!existing || resultTotalForDisplay(result) > resultTotalForDisplay(existing)) {
        participantMap.set(result.assigned_number, result)
      }
    })
    
    processedResults = Array.from(participantMap.values())
  }

  const isNewUser = (assignedNumber: number): boolean => {
    const pData = participantData.get(assignedNumber)
    if (!pData?.created_at) return false
    const created = new Date(pData.created_at)
    const now = new Date()
    return created.toDateString() === now.toDateString()
  }

  const isFemaleParticipant = (assignedNumber: number): boolean => {
    const pData = participantData.get(assignedNumber)
    const sd = pData?.survey_data || {}
    const ans = sd?.answers || {}
    const raw = pData?.gender ?? ans?.gender ?? sd?.gender
    const g = String(raw || '').toLowerCase()
    return g === 'female' || g === 'f' || g === 'أنثى' || g === 'أُنثَى' || g === 'انثى'
  }

  const bulkExcludeUnpaidGirls = async () => {
    if (matchType === "group") return
    if (bulkExcludingUnpaidGirls) return

    const targets: Array<{ number: number; name: string }> = []
    for (const r of sortedResults) {
      const num = r.assigned_number
      if (!isFemaleParticipant(num)) continue
      const wasContacted = isMessageSent(num)
      if (!wasContacted) continue
      const selfPaid = r.paid_done === true || participantData.get(num)?.PAID_DONE === true
      if (selfPaid) continue

      const partner = r.partner_assigned_number
      const hasRealPartner = !!partner && partner !== 9999
      const partnerPaid = hasRealPartner
        ? (r.partner_paid_done === true || participantData.get(partner as number)?.PAID_DONE === true)
        : false

      if (partnerPaid) continue
      targets.push({ number: num, name: r.name || `#${num}` })
    }

    if (targets.length === 0) {
      toast.success("لا توجد سيدات تم التواصل معهن ولم يدفعن للاستبعاد")
      return
    }

    if (!confirm(`استبعاد مؤقت (-1) للسيدات اللاتي تم التواصل معهن ولم يدفعن؟\n\nسيتم استبعاد: ${targets.length}\n\nملاحظة: لن يتم استبعاد من لديها شريك مدفوع.`)) {
      return
    }

    setBulkExcludingUnpaidGirls(true)
    let ok = 0
    let skipped = 0
    let failed = 0
    try {
      for (const t of targets) {
        try {
          const res = await fetch("/api/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "add-excluded-participant",
              participantNumber: t.number,
              banPermanently: false,
              groupOnly: false,
              reason: "TEMP - unpaid girl auto-exclude",
            }),
          })
          const data = await res.json().catch(() => ({}))
          if (res.ok) ok++
          else if (String(data?.error || '').toLowerCase().includes('already')) skipped++
          else failed++
        } catch {
          failed++
        }
      }

      toast.success(`تم الاستبعاد: ${ok}${skipped ? ` | موجود مسبقاً: ${skipped}` : ''}${failed ? ` | فشل: ${failed}` : ''}`, { duration: 5000 })
      if (onRefresh) await onRefresh()
    } finally {
      setBulkExcludingUnpaidGirls(false)
    }
  }

  // Resolve persisted match rows and calculated cache rows once through the
  // provenance-aware merge. Every table, sort, tooltip, and detail view must
  // consume this catalog so historical totals cannot inherit today's parts.
  const changeResultSort = (key: ResultSortKey) => {
    if (resultSortKey === key) {
      setResultSortDirection(direction => direction === "asc" ? "desc" : "asc")
      return
    }
    setResultSortKey(key)
    setResultSortDirection(key === "name" || key === "partner" || key === "assigned_number" ? "asc" : "desc")
  }

  const resultSortValue = (result: ParticipantResult): number | string | null => {
    if (resultSortKey === "name") return result.name || ""
    if (resultSortKey === "partner") return result.partner_assigned_number ?? result.partner_name ?? ""
    if (resultSortKey === "compound_lifestyle_score") {
      if (!result.partner_assigned_number) return null
      const pair = getResultPairData(result)
      if (!pair) return null
      const dimensions = currentBalancedDimensionsForDisplay(pair)
      if (!dimensions) return null
      const keys = new Set(["vibe", "disagreement", "focus", "similarity", "attachment", "lifestyle"])
      const values = dimensions.filter(dimension => keys.has(dimension.key)).map(dimension => dimension.value)
      return values.every(value => value !== null) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null
    }
    if (resultSortKey === "communication_compatibility_score") {
      const pair = result.partner_assigned_number ? getResultPairData(result) : undefined
      return communicationScoreForDisplay(pair ?? result) ?? null
    }
    const dimensionKeyBySort: Partial<Record<ResultSortKey, string>> = {
      synergy_score: "synergy",
      disagreement_style_score: "disagreement",
      current_life_overlap_score: "focus",
      similarity_preference_score: "similarity",
      attachment_pace_score: "attachment",
      lifestyle_compatibility_score: "lifestyle",
      humor_open_score: "humor",
      core_values_compatibility_score: "values",
      intent_score: "intent",
      vibe_compatibility_score: "vibe",
    }
    const dimensionKey = dimensionKeyBySort[resultSortKey]
    if (dimensionKey && result.partner_assigned_number) {
      const pair = getResultPairData(result)
      const currentValue = currentBalancedDimensionsForDisplay(pair)?.find(dimension => dimension.key === dimensionKey)?.value
      if (currentValue !== null && currentValue !== undefined) return currentValue
    }
    if (resultSortKey === "compatibility_score" && result.partner_assigned_number) {
      return compatibilityTotalForDisplay(getResultPairData(result) ?? result)
    }
    let value = result[resultSortKey]
    if (value == null && result.partner_assigned_number) {
      const pair = getResultPairData(result)
      value = pair?.[resultSortKey]
    }
    return typeof value === "number" || typeof value === "string" ? value : null
  }

  const sortedResults = [...processedResults].sort((a, b) => {
    const left = resultSortValue(a)
    const right = resultSortValue(b)
    if (left == null && right == null) return 0
    if (left == null) return 1
    if (right == null) return -1
    const comparison = typeof left === "string" || typeof right === "string"
      ? String(left).localeCompare(String(right), "ar", { numeric: true, sensitivity: "base" })
      : Number(left) - Number(right)
    return resultSortDirection === "asc" ? comparison : -comparison
  })

  // Apply temporary filters (hide only — preserve normal order)
  // Two-way: a participant is hidden if they OR their partner matches the filter.
  const visibleResults = sortedResults.filter((r) => {
    const partner = r.partner_assigned_number
    const hasPartner = !!partner && partner !== 9999
    const normalizedQuery = resultQuery.trim().toLocaleLowerCase("ar")
    if (normalizedQuery) {
      const haystack = [r.assigned_number, r.name, r.partner_assigned_number, r.partner_name]
        .filter(value => value != null)
        .join(" ")
        .toLocaleLowerCase("ar")
      if (!haystack.includes(normalizedQuery)) return false
    }
    const participant = participantData.get(r.assigned_number)
    if (attendanceFilter === "confirmed" && participant?.attendance_confirmed !== true) return false
    if (attendanceFilter === "declined" && !participant?.attendance_denied_at) return false
    if (attendanceFilter === "pending" && (participant?.attendance_confirmed === true || participant?.attendance_denied_at)) return false
    if (attendanceFilter === "arrived" && participant?.arrival_status !== "arrived") return false
    if (hideMessaged) {
      const selfMessaged = isMessageSent(r.assigned_number)
      const partnerMessaged = hasPartner ? isMessageSent(partner as number) : false
      if (selfMessaged || partnerMessaged) return false
    }
    if (hidePaid) {
      const selfPaid = !!r.paid_done
      const partnerPaid = hasPartner ? !!r.partner_paid_done : false
      if (selfPaid || partnerPaid) return false
    }
    if (showNewOnly) {
      const selfNew = isNewUser(r.assigned_number)
      const partnerNew = hasPartner ? isNewUser(partner as number) : false
      if (!selfNew && !partnerNew) return false
    }
    if (showPaidOnly) {
      const selfPaid = !!r.paid_done
      const partnerPaid = hasPartner ? !!r.partner_paid_done : false
      if (!selfPaid && !partnerPaid) return false
    }
    if (showUnmessagedFemalesOnly) {
      if (!isFemaleParticipant(r.assigned_number) || isMessageSent(r.assigned_number)) return false
    }
    if (showContactedUnpaidFemalesOnly && !isContactedUnpaidFemale(participantData.get(r.assigned_number))) return false
    return true
  })

  const shadowAggregate = useMemo(() => {
    const aggregate = {
      total: { total: 0, count: 0 },
      expression_language: { total: 0, count: 0 },
      social_relationship_style: { total: 0, count: 0 },
      minimum_partner_religious_commitment: { total: 0, count: 0 },
    }

    const toPercent = (sum: number, count: number) => count > 0 ? Math.round(sum / count) : null

    const bump = (key: keyof typeof aggregate, value: number) => {
      aggregate[key].total += value
      aggregate[key].count += 1
    }

    for (const row of visibleResults) {
      const x = row.assigned_number
      const y = row.partner_assigned_number
      const scores = buildShadowBadges(x, y, participantData)
      for (const metric of shadowMetrics) {
        const value = scores[metric.id]
        if (typeof value === "number") {
          bump(metric.id as keyof typeof aggregate, value)
          bump("total", value)
        }
      }
    }

    return {
      overall: toPercent(aggregate.total.total, aggregate.total.count),
      expression_language: toPercent(aggregate.expression_language.total, aggregate.expression_language.count),
      social_relationship_style: toPercent(aggregate.social_relationship_style.total, aggregate.social_relationship_style.count),
      minimum_partner_religious_commitment: toPercent(aggregate.minimum_partner_religious_commitment.total, aggregate.minimum_partner_religious_commitment.count),
    }
  }, [visibleResults, participantData])

  const fetchParticipantDetails = (participantNumber: number, participantName: string) => {
    setLoadingDetails(true)
    
    // Filter the canonical pair catalog to get all matches for this participant.
    const participantPairs = Array.from(pairScoreLookup.values()).filter(pair =>
      Number(pair.participant_a) === participantNumber || Number(pair.participant_b) === participantNumber
    )
    
    // Convert to the format expected by ParticipantDetailModal
    const matches = participantPairs.map(pair => {
      const normalizedPair = pair
      const otherParticipantNumber = Number(pair.participant_a) === participantNumber ? Number(pair.participant_b) : Number(pair.participant_a)
      
      // Try to find name from multiple sources
      const otherParticipantFromResults = results.find(r => r.assigned_number === otherParticipantNumber)
      const otherParticipantFromData = participantData.get(otherParticipantNumber)
      
      // Get name from available sources
      const otherParticipantName = otherParticipantFromResults?.name || 
                                   otherParticipantFromData?.name ||
                                   otherParticipantFromData?.survey_data?.name ||
                                   otherParticipantFromData?.survey_data?.answers?.name ||
                                   `المشارك #${otherParticipantNumber}`
      
      // Intent letters from backend mapping
      const intentSelf = Number(pair.participant_a) === participantNumber ? (pair.intent_a || null) : (pair.intent_b || null)
      const intentOther = Number(pair.participant_a) === participantNumber ? (pair.intent_b || null) : (pair.intent_a || null)

      return {
        participant_number: otherParticipantNumber,
        participant_name: otherParticipantName,
        compatibility_score: pair.compatibility_score,
        mbti_compatibility_score: pair.mbti_compatibility_score,
        attachment_compatibility_score: pair.attachment_compatibility_score,
        communication_compatibility_score: pair.communication_compatibility_score,
        lifestyle_compatibility_score: pair.lifestyle_compatibility_score,
        core_values_compatibility_score: pair.core_values_compatibility_score,
        vibe_compatibility_score: pair.vibe_compatibility_score,
        // New model fields
        synergy_score: pair.synergy_score,
        humor_open_score: pair.humor_open_score,
        intent_score: pair.intent_score,
        disagreement_style_score: pair.disagreement_style_score,
        current_life_overlap_score: pair.current_life_overlap_score,
        similarity_preference_score: pair.similarity_preference_score,
        attachment_pace_score: pair.attachment_pace_score,
        participant_a: Number(pair.participant_a),
        participant_b: Number(pair.participant_b),
        match_insights_status: pair.match_insights_status,
        match_insights_complete_a: pair.match_insights_complete_a,
        match_insights_complete_b: pair.match_insights_complete_b,
        match_insights_answered_a: pair.match_insights_answered_a,
        match_insights_answered_b: pair.match_insights_answered_b,
        match_insights_total_questions: pair.match_insights_total_questions,
        intent_a: pair.intent_a,
        intent_b: pair.intent_b,
        intent_self: intentSelf,
        intent_other: intentOther,
        // Gates & bonuses
        attachment_penalty_applied: pair.attachment_penalty_applied,
        intent_boost_applied: pair.intent_boost_applied,
        dead_air_veto_applied: normalizedPair.dead_air_veto_applied,
        humor_clash_detected: pair.humor_clash_detected,
        humor_clash_veto_applied: pair.humor_clash_veto_applied,
        cap_applied: pair.cap_applied,
        reason: pair.reason,
        is_actual_match: pair.is_actual_match,
        is_repeated_match: pair.is_repeated_match,
        humor_early_openness_bonus: pair.humor_early_openness_bonus,
        history_model_version: pair.history_model_version,
        history_confidence_enabled: pair.history_confidence_enabled,
        history_confidence_status: pair.history_confidence_status,
        historical_outcome_score: pair.historical_outcome_score,
        historical_confidence: pair.historical_confidence,
        predictive_outcome_score: pair.predictive_outcome_score,
        predictive_confidence: pair.predictive_confidence,
        combined_history_score: pair.combined_history_score,
        combined_history_confidence: pair.combined_history_confidence,
        history_priority_adjustment: pair.history_priority_adjustment,
        history_badges: pair.history_badges,
        history_explanations: pair.history_explanations,
        historical_evidence: pair.historical_evidence,
        history_timeline: pair.history_timeline,
        history_prediction_details: pair.history_prediction_details,
        history_verdict: pair.history_verdict,
        history_direction_a_to_b: pair.history_direction_a_to_b,
        history_direction_b_to_a: pair.history_direction_b_to_a,
        mutual_interest: pair.mutual_interest,
        one_sided_interest: pair.one_sided_interest,
        conflicting_interest: pair.conflicting_interest,
        history_review_recommendation: pair.history_review_recommendation,
        history_review_reason: pair.history_review_reason,
        score_model_version: pair.score_model_version ?? pair.scoreModelVersion,
        score_content_hash: pair.score_content_hash ?? pair.scoreContentHash,
        score_breakdown: pair.score_breakdown ?? pair.scoreBreakdown,
        question_scores: pair.question_scores ?? pair.questionScores,
        score_snapshot: pair.score_snapshot ?? pair.scoreSnapshot,
        score_provenance_valid: pair.score_provenance_valid ?? pair.scoreProvenanceValid,
        never_pair_recommended: pair.never_pair_recommended,
        history_hard_blocked: pair.history_hard_blocked,
      }
    })
    
    setSelectedParticipant({ assigned_number: participantNumber, name: participantName })
    setParticipantMatches(matches)
    setShowDetailModal(true)
    setLoadingDetails(false)
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-400"
    if (score >= 60) return "text-yellow-400"
    if (score >= 40) return "text-orange-400"
    return "text-red-400"
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-500/20 border-green-400/30"
    if (score >= 60) return "bg-yellow-500/20 border-yellow-400/30"
    if (score >= 40) return "bg-orange-500/20 border-orange-400/30"
    return "bg-red-500/20 border-red-400/30"
  }

  const getAgeFlexDecision = (participantNumber: number): 'accepted' | 'declined' | 'unanswered' => {
    const pData = participantData.get(participantNumber)
    const raw = pData?.age_flex_one_year ??
      pData?.survey_data?.answers?.age_flex_one_year ??
      pData?.survey_data?.answers?.age_flex_if_no_match
    const normalized = String(raw ?? '').trim().toLowerCase()
    if (raw === true || ['true', 'accept', 'accepted', 'yes'].includes(normalized)) return 'accepted'
    if (raw === false || ['false', 'decline', 'declined', 'no'].includes(normalized)) return 'declined'
    return 'unanswered'
  }

  // Open pair analysis for a specific row
  const openPairAnalysis = (participant: ParticipantResult) => {
    const hasRealPartner = !!participant.partner_assigned_number && participant.partner_assigned_number !== 9999
    const x = participant.assigned_number
    const y = hasRealPartner ? (participant.partner_assigned_number as number) : 9999

    const pair = hasRealPartner ? getResultPairData(participant) : null

    // Full participant rows (with survey_data) if available
    const aFull = participantData.get(x) || { assigned_number: x, name: participant.name, survey_data: {} }
    const bFull = hasRealPartner
      ? (participantData.get(y) || { assigned_number: y, name: participant.partner_name || `#${y}`, survey_data: {} })
      : {
          assigned_number: 9999,
          name: 'شريك افتراضي',
          survey_data: {
            answers: {
              conversational_role: 'B',
              conversation_depth_pref: 'B',
              social_battery: 'B',
              humor_subtype: 'B',
              curiosity_style: 'B',
              silence_comfort: 'B',
              humor_banter_style: 'B',
              early_openness_comfort: '2',
              intent_goal: 'C',
            },
          },
        }

    setAnalysisA(aFull || null)
    setAnalysisB(bFull || null)
    setAnalysisPair(pair || null)
    setShowPairAnalysis(true)
  }

  const renderSortableHeader = (label: string, key: ResultSortKey, align: "right" | "center" = "center") => (
    <th className={`${align === "right" ? "text-right" : "text-center"} p-2 text-sm font-semibold text-slate-300`}>
      <button
        type="button"
        onClick={() => changeResultSort(key)}
        className={`inline-flex w-full items-center gap-1 rounded px-1 py-1 transition-colors hover:bg-white/10 hover:text-white ${align === "right" ? "justify-start" : "justify-center"}`}
        title={`ترتيب حسب ${label}`}
      >
        <span className="text-xs">{label}</span>
        <ArrowUpDown className={`h-3 w-3 ${resultSortKey === key ? "text-cyan-300" : "text-slate-500"}`} />
        {resultSortKey === key && <span className="text-[9px] text-cyan-300">{resultSortDirection === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  )

  return (
    <div className={`fixed inset-0 ${cohostTheme ? 'bg-rose-900/40' : 'bg-black/50'} backdrop-blur-sm z-50 flex items-center justify-center p-4`}>
      <div className={`${cohostTheme ? 'bg-gradient-to-br from-rose-950 via-slate-900 to-rose-950 border-4 border-rose-400/30 rounded-3xl' : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/20 rounded-2xl'} shadow-2xl w-full max-w-6xl max-h-[90dvh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${cohostTheme ? 'border-rose-400/20' : 'border-white/20'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${cohostTheme ? 'bg-gradient-to-r from-rose-500 to-pink-600' : 'bg-gradient-to-r from-purple-600 to-pink-600'}`}>
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                نتائج التوافق - {matchType === "ai" ? "مع الذكاء الاصطناعي" : matchType === "no-ai" ? "بدون ذكاء اصطناعي" : "مجموعات"}
              </h2>
              <p className="text-slate-400 text-sm">
                إجمالي التوافقات: {totalMatches} | المشاركين: {sortedResults.length}
                {matchType !== "group" && (() => {
                  const paidNoMatch = sortedResults.filter(r => r.paid_done && r.is_organizer_match).length;
                  return paidNoMatch > 0 ? (
                    <span className="text-red-400"> | دفعوا بدون مطابقة: {paidNoMatch}</span>
                  ) : null;
                })()}
                {matchType !== "group" && (() => {
                  // Count unique pairs where one is paid and the other is unpaid
                  const seen = new Set<string>()
                  let mismatch = 0
                  for (const r of sortedResults) {
                    const a = r.assigned_number
                    const b = r.partner_assigned_number
                    if (!b || b === 9999) continue // skip organizer/non-pairs
                    const key = a < b ? `${a}-${b}` : `${b}-${a}`
                    if (seen.has(key)) continue
                    seen.add(key)
                    const aPaid = r.paid_done === true
                    const bPaid = r.partner_paid_done === true
                    if (aPaid !== bPaid) mismatch++
                  }
                  return mismatch > 0 ? (
                    <span className="text-amber-400"> | مدفوع + غير مدفوع: {mismatch}</span>
                  ) : null
                })()}
                {matchType !== "group" && results.length !== sortedResults.length && (
                  <span className="text-yellow-400"> (تم إزالة {results.length - sortedResults.length} مكرر)</span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl ${cohostTheme ? 'bg-rose-500/20 hover:bg-rose-500/30' : 'bg-white/10 hover:bg-white/20'} text-white transition-all duration-300`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {onOpenControlCenter && matchType !== "group" && (
          <div className="mx-6 mt-3 grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1">
            <button onClick={onOpenControlCenter} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white">مركز التحكم الجديد</button>
            <button className="rounded-lg bg-purple-500 px-3 py-2 text-xs font-black text-white shadow-lg shadow-purple-950/30">عرض النتائج القديم</button>
          </div>
        )}
        
        

        {/* Weights Legend */}
        {matchType !== "group" && (
          <div className="mx-6 mt-3 mb-1 text-xs text-slate-300/80">
            <div className="inline-flex flex-wrap items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
              <span className="font-semibold text-slate-200">النموذج الشخصي الحالي · تعلّم من ترتيبات الفعالية 26:</span>
              <span>الأرضية المشتركة 18</span>
              <span>إيقاع التفاعل 20</span>
              <span>الدعابة/الانفتاح 10</span>
              <span>وتيرة التقارب 8</span>
              <span>نمط الحياة 12</span>
              <span>القيم/الحدود/اللغة 17</span>
              <span>التواصل/الاختلاف 10</span>
              <span>الهدف 5</span>
              <span className="text-slate-500">هذه أبعاد تشخيصية وليست جمعاً للنسبة؛ النسبة تجمع التفضيل المتوقع في الاتجاهين. الصفوف التاريخية تعرض المجموع فقط عند غياب لقطة دقيقة.</span>
            </div>
          </div>
        )}

        {/* Fresh Data Warning */}
        {isFreshData && (
          <div className="mx-6 mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="bg-amber-500/20 p-2 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-amber-400 font-medium mb-1">عرض البيانات المحدثة</h4>
                <p className="text-amber-300/80 text-sm">
                  تعرض هذه النتائج البيانات المحدثة من قاعدة البيانات بعد التبديل. 
                  لحفظ هذه النتائج بشكل دائم، قم بإنشاء جلسة جديدة من خلال إعادة توليد المطابقات.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        {matchType !== "group" && results.length > 0 && (
          <div className="mx-6 mt-4 flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-400">فلترة مؤقتة:</span>
            <label className="relative min-w-[190px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={resultQuery}
                onChange={(event) => setResultQuery(event.target.value)}
                placeholder="بحث بالرقم أو الاسم أو الشريك..."
                className="w-full rounded-lg border border-white/15 bg-white/5 py-1.5 pl-3 pr-8 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
              />
            </label>
            <select
              value={attendanceFilter}
              onChange={(event) => setAttendanceFilter(event.target.value as typeof attendanceFilter)}
              className="rounded-lg border border-white/15 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-cyan-400/50"
              aria-label="فلترة حالة الحضور"
            >
              <option value="all">كل حالات الحضور</option>
              <option value="confirmed">حضور مؤكد</option>
              <option value="arrived">وصل</option>
              <option value="declined">اعتذر</option>
              <option value="pending">لم يرد</option>
            </select>
            <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all duration-200 text-sm ${
              hideMessaged
                ? 'bg-blue-500/20 border-blue-400/40 text-blue-200'
                : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
            }`}>
              <input
                type="checkbox"
                checked={hideMessaged}
                onChange={(e) => setHideMessaged(e.target.checked)}
                className="accent-blue-500 w-4 h-4"
              />
              <MessageCircle className="w-4 h-4" />
              <span>إخفاء من تم التواصل معهم</span>
            </label>
            <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all duration-200 text-sm ${
              hidePaid
                ? 'bg-green-500/20 border-green-400/40 text-green-200'
                : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
            }`}>
              <input
                type="checkbox"
                checked={hidePaid}
                onChange={(e) => setHidePaid(e.target.checked)}
                className="accent-green-500 w-4 h-4"
              />
              <DollarSign className="w-4 h-4" />
              <span>إخفاء من دفعوا</span>
            </label>
            <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all duration-200 text-sm ${
              showNewOnly
                ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
            }`}>
              <input
                type="checkbox"
                checked={showNewOnly}
                onChange={(e) => setShowNewOnly(e.target.checked)}
                className="accent-cyan-500 w-4 h-4"
              />
              <Sparkles className="w-4 h-4" />
              <span>جديد فقط</span>
            </label>
            <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all duration-200 text-sm ${
              showPaidOnly
                ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
            }`}>
              <input
                type="checkbox"
                checked={showPaidOnly}
                onChange={(e) => setShowPaidOnly(e.target.checked)}
                className="accent-amber-500 w-4 h-4"
              />
              <DollarSign className="w-4 h-4" />
              <span>مدفوع فقط</span>
            </label>
            <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all duration-200 text-sm ${
              showUnmessagedFemalesOnly
                ? 'bg-pink-500/20 border-pink-400/40 text-pink-200'
                : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
            }`}>
              <input
                type="checkbox"
                checked={showUnmessagedFemalesOnly}
                onChange={(e) => setShowUnmessagedFemalesOnly(e.target.checked)}
                className="accent-pink-500 w-4 h-4"
              />
              <MessageCircle className="w-4 h-4" />
              <span>بنات لم يتم التواصل معهن فقط</span>
            </label>
            <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all duration-200 text-sm ${
              showContactedUnpaidFemalesOnly
                ? 'bg-orange-500/20 border-orange-400/40 text-orange-200'
                : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
            }`}>
              <input
                type="checkbox"
                checked={showContactedUnpaidFemalesOnly}
                onChange={(e) => setShowContactedUnpaidFemalesOnly(e.target.checked)}
                className="accent-orange-500 w-4 h-4"
              />
              <MessageCircle className="w-4 h-4" />
              <span>متواصل معهن ولم يدفعن فقط</span>
            </label>
            <button
              onClick={bulkExcludeUnpaidGirls}
              disabled={bulkExcludingUnpaidGirls}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200 text-sm ${
                bulkExcludingUnpaidGirls
                  ? 'bg-orange-500/15 border-orange-400/30 text-orange-200 opacity-70'
                  : 'bg-orange-500/10 border-orange-400/25 text-orange-200 hover:bg-orange-500/15'
              }`}
              title="استبعاد مؤقت (-1) للسيدات اللاتي تم التواصل معهن ولم يدفعن (إلا إذا كانت مع شريك مدفوع)"
            >
              <UserX className={"w-4 h-4" + (bulkExcludingUnpaidGirls ? " animate-pulse" : "")} />
              <span>استبعاد المتواصل معهن ولم يدفعن</span>
            </button>
            {(resultQuery || attendanceFilter !== "all" || hideMessaged || hidePaid || showNewOnly || showPaidOnly || showUnmessagedFemalesOnly || showContactedUnpaidFemalesOnly) && (
              <span className="text-xs text-slate-400">
                ({visibleResults.length} ظاهر من {sortedResults.length})
              </span>
            )}
          </div>
        )}

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
          {results.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">لا توجد نتائج</h3>
              <p className="text-slate-400">لم يتم العثور على مطابقات للمشاركين</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="flex flex-wrap gap-2 mb-4 text-sm">
                <div className="bg-white/5 border border-white/20 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span className="text-slate-300">المشاركين:</span>
                  <span className="font-bold text-white">{sortedResults.length}</span>
                </div>
                <div className="bg-white/5 border border-white/20 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-pink-400" />
                  <span className="text-slate-300">متوسط:</span>
                  <span className="font-bold text-white">{sortedResults.length > 0 ? Math.round(sortedResults.reduce((sum, result) => sum + resultTotalForDisplay(result), 0) / sortedResults.length) : 0}%</span>
                </div>
                <div className="bg-white/5 border border-white/20 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400" />
                  <span className="text-slate-300">أعلى:</span>
                  <span className="font-bold text-white">{sortedResults.length > 0 ? Math.max(...sortedResults.map(resultTotalForDisplay)) : 0}%</span>
                </div>
                <div className="bg-white/5 border border-white/20 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-green-400" />
                  <span className="text-slate-300">المطابقات:</span>
                  <span className="font-bold text-white">{totalMatches}</span>
                </div>
                <div className="bg-white/5 border border-white/20 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <span className="text-slate-300 text-sm">متوسط محاذاة الملف:</span>
                  </div>
                  <span className="font-bold text-white mt-1 inline-flex items-center gap-1">
                    {shadowAggregate.overall == null ? "—" : `${shadowAggregate.overall}%`}
                  </span>
                  <div className="mt-2 flex w-full min-w-0 items-center justify-center gap-2">
                    {[
                      ["لغة", shadowAggregate.expression_language],
                      ["اجتماعي", shadowAggregate.social_relationship_style],
                      ["التزام", shadowAggregate.minimum_partner_religious_commitment],
                    ].map(([label, value]) => {
                      const text = value == null ? "—" : `${value}%`
                      return (
                        <div
                          key={label}
                          className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-sm border border-white/10 bg-white/5 px-1.5 py-1 text-center"
                          title={`${label}: ${text}`}
                        >
                          <span className="block w-full min-w-0 truncate text-[9px] leading-tight text-slate-400">{label}</span>
                          <span className="mt-0.5 block whitespace-nowrap text-[10px] font-bold leading-none text-white">{text}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Participants Table */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-white/10">
                      <tr>
                        {renderSortableHeader("رقم المشارك", "assigned_number", "right")}
                        {renderSortableHeader("الاسم", "name", "right")}
                        {renderSortableHeader("الشريك", "partner", "right")}
                        {renderSortableHeader("التوافق الإجمالي", "compatibility_score")}
                        {matchType !== "group" && (
                          <th className="text-center p-2 text-sm font-semibold text-slate-300">محاذاة الملف</th>
                        )}
                        {matchType !== "group" && (
                          <th className="text-center p-2 text-sm font-semibold text-slate-300">استبعاد</th>
                        )}
                        {matchType !== "group" && (
                          <th className="text-center p-2 text-sm font-semibold text-slate-300">تثبيت التوافق</th>
                        )}
                        {matchType !== "group" && (
                          <th className="text-center p-2 text-sm font-semibold text-slate-300">عرض التفاصيل</th>
                        )}
                        {matchType !== "group" && (
                          <th className="text-center p-2 text-sm font-semibold text-slate-300">تحليل</th>
                        )}
                        {matchType !== "group" && (
                          <th className="text-center p-2 text-sm font-semibold text-slate-300">واتساب</th>
                        )}
                        {matchType !== "group" && (
                          <th className="text-center p-2 text-sm font-semibold text-slate-300">القيود/التفاصيل</th>
                        )}
                        {matchType !== "group" && (
                          <>
                            {renderSortableHeader("إيقاع التفاعل", "synergy_score")}
                            {renderSortableHeader("إدارة الاختلاف", "disagreement_style_score")}
                            {renderSortableHeader("المرحلة الحالية", "current_life_overlap_score")}
                            {renderSortableHeader("تفضيل التشابه", "similarity_preference_score")}
                            {renderSortableHeader("وتيرة التقارب", "attachment_pace_score")}
                            {renderSortableHeader("استدامة نمط الحياة", "lifestyle_compatibility_score")}
                            {renderSortableHeader("الدعابة/الانفتاح", "humor_open_score")}
                            {renderSortableHeader("التواصل", "communication_compatibility_score")}
                            {renderSortableHeader("القيم/الحدود/اللغة", "core_values_compatibility_score")}
                            {renderSortableHeader("الهدف", "intent_score")}
                            {matchType === "ai" && (
                              renderSortableHeader("التوافق الدلالي", "vibe_compatibility_score")
                            )}
                            {renderSortableHeader("السياق والتقارب والحياة", "compound_lifestyle_score")}
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleResults.map((participant, index) => (
                        <tr 
                          key={participant.id} 
                          className={`border-t border-white/10 hover:bg-white/5 transition-colors ${
                            participant.is_organizer_match 
                              ? 'bg-gradient-to-r from-red-500/10 to-transparent border-red-500/20' 
                              : ''
                          } ${(() => {
                            // Yellow only when the B-intent person is the one who accepts different goals (both directions)
                            const x = participant.assigned_number
                            const y = participant.partner_assigned_number
                            if (!y) return ''
                            const pair = getResultPairData(participant)
                            if (!pair) return ''
                            const own = pair.participant_a === x ? (pair.intent_a || '') : (pair.intent_b || '')
                            const other = pair.participant_a === x ? (pair.intent_b || '') : (pair.intent_a || '')
                            const aData = participantData.get(x)
                            const bData = participantData.get(y)
                            const ansA = aData?.survey_data?.answers || {}
                            const ansB = bData?.survey_data?.answers || {}
                            const openA = (aData?.open_intent_goal_mismatch === true) || (ansA.open_intent_goal_mismatch === true) || (ansA.open_intent_goal_mismatch === 'true')
                            const openB = (bData?.open_intent_goal_mismatch === true) || (ansB.open_intent_goal_mismatch === true) || (ansB.open_intent_goal_mismatch === 'true')
                            if (own === 'B' && other && other !== 'B') {
                              return openA ? 'bg-yellow-500/10 border-yellow-400/20' : 'bg-red-500/10 border-red-400/20'
                            }
                            if (other === 'B' && own && own !== 'B') {
                              return openB ? 'bg-yellow-500/10 border-yellow-400/20' : 'bg-red-500/10 border-red-400/20'
                            }
                            return ''
                          })()}`}
                        >
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              {index < 3 && !participant.is_organizer_match && (
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  index === 0 ? 'bg-yellow-500 text-black' :
                                  index === 1 ? 'bg-gray-400 text-black' :
                                  'bg-orange-600 text-white'
                                }`}>
                                  {index + 1}
                                </div>
                              )}
                              {participant.is_organizer_match && (
                                <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center" title="لم يتم العثور على مطابقة">
                                  <AlertTriangle className="w-4 h-4 text-white" />
                                </div>
                              )}
                              <span className="font-mono text-white font-semibold">
                                #{participant.assigned_number}
                              </span>
                              {(() => {
                                const pData = participantData.get(participant.assigned_number)
                                const signupEventId = pData?.signup_event_id
                                const isSignedUp = pData?.signup_for_next_event === true || pData?.auto_signup_next_event === true
                                if (!isSignedUp || !signupEventId) return null
                                return (
                                  <span className="px-1.5 py-0.5 text-[10px] bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-400/30" title={`سجل من فعالية #${signupEventId}`}>
                                    E{signupEventId}
                                  </span>
                                )
                              })()}
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              {toggleParticipantSelection && selectedParticipants && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleParticipantSelection(participant.assigned_number)
                                  }}
                                  className="flex-shrink-0 transition-colors"
                                  title={selectedParticipants.has(participant.assigned_number) ? "إلغاء التحديد" : "تحديد للتصدير"}
                                >
                                  {selectedParticipants.has(participant.assigned_number) ? (
                                    <CheckSquare className="w-4 h-4 text-cyan-400" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-500 hover:text-slate-300" />
                                  )}
                                </button>
                              )}
                              <Dialog.Root>
                                <Dialog.Trigger asChild>
                                  <button
                                    type="button"
                                    className="cursor-pointer text-left hover:underline focus:outline-none"
                                  >
                                    <span className="text-white font-medium hover:text-cyan-300 transition-colors">
                                      {participant.name || "غير محدد"}
                                    </span>
                                    {isNewUser(participant.assigned_number) && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 text-[10px] font-medium" title="مستخدم جديد — تم إنشاء الحساب اليوم">
                                        <Sparkles className="w-2.5 h-2.5" />
                                        جديد
                                      </span>
                                    )}
                                    {(() => {
                                      const decision = getAgeFlexDecision(participant.assigned_number)
                                      const meta = decision === "accepted"
                                        ? { label: "مرونة العمر ✓", style: "bg-emerald-500/20 border-emerald-400/30 text-emerald-300", title: "وافق على مرونة العمر ±1 سنة" }
                                        : decision === "declined"
                                          ? { label: "مرونة العمر ✕", style: "bg-red-500/20 border-red-400/30 text-red-300", title: "رفض مرونة العمر ±1 سنة" }
                                          : { label: "مرونة العمر —", style: "bg-amber-500/20 border-amber-400/30 text-amber-300", title: "لم يجب عن مرونة العمر ±1 سنة" }
                                      return (
                                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${meta.style}`} title={meta.title}>
                                          {meta.label}
                                        </span>
                                      )
                                    })()}
                                  </button>
                                </Dialog.Trigger>
                                <Dialog.Portal>
                                  <Dialog.Overlay className="fixed inset-0 z-[129] bg-slate-950/55 backdrop-blur-[1px]" />
                                  <Dialog.Content
                                    dir="rtl"
                                    className="
                                      fixed left-1/2 top-1/2 z-[130]
                                      w-[min(94vw,680px)]
                                      max-h-[84dvh]
                                      -translate-x-1/2 -translate-y-1/2
                                      overflow-hidden
                                      rounded-xl
                                      border border-cyan-400/30
                                      bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900
                                      shadow-2xl
                                      focus:outline-none
                                    "
                                  >
                                    <Dialog.Close
                                      className="
                                        absolute left-2 top-2 z-20
                                        rounded-md bg-white/10 p-1.5
                                        text-white
                                        hover:bg-white/20
                                      "
                                      aria-label="إغلاق"
                                    >
                                      <X className="h-4 w-4" />
                                    </Dialog.Close>
                                    <ParticipantHoverCardContent
                                      participantNumber={participant.assigned_number}
                                      participantName={participant.name || "غير محدد"}
                                      pData={participantData.get(participant.assigned_number)}
                                      history={localMatchHistory[participant.assigned_number] || []}
                                      currentEventId={currentEventId}
                                      impressions={impressionsMap[participant.assigned_number] || []}
                                    />
                                  </Dialog.Content>
                                </Dialog.Portal>
                              </Dialog.Root>
                              {(() => {
                                // Show yellow alert icon next to the participant name if openness is 0×0 for this pair
                                const x = participant.assigned_number
                                const y = participant.partner_assigned_number
                                if (!y || y === 9999) return null
                                const pair = getResultPairData(participant)
                                if (!pair || isSupportedCurrentScoreRow(pair) || isSupportedCurrentScoreRow(participant)) return null
                                const aData = participantData.get(x)
                                const bData = participantData.get(y)
                                const oa = aData?.early_openness_comfort ?? aData?.survey_data?.answers?.early_openness_comfort
                                const ob = bData?.early_openness_comfort ?? bData?.survey_data?.answers?.early_openness_comfort
                                const oaNum = Number.parseInt(String(oa ?? ''), 10)
                                const obNum = Number.parseInt(String(ob ?? ''), 10)
                                if (oaNum === 0 && obNum === 0) {
                                  return (
                                    <div title="عقوبة الانفتاح 0×0">
                                      <AlertTriangle className="w-4 h-4 text-yellow-400" />
                                    </div>
                                  )
                                }
                                return null
                              })()}
                              {/* Message sent indicator */}
                              {isMessageSent(participant.assigned_number) ? (
                                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center" title="تم التواصل واتساب">
                                  <MessageCircle className="w-3 h-3 text-white" />
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center" title="لم يتم التواصل">
                                  <MessageCircle className="w-3 h-3 text-slate-400" />
                                </div>
                              )}
                              {/* Payment indicator */}
                              {participant.paid_done ? (
                                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center" title="دفع مكتمل">
                                  <DollarSign className="w-3 h-3 text-white" />
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center" title="لم يدفع">
                                  <XCircle className="w-3 h-3 text-white" />
                                </div>
                              )}
                              {/* Exclude Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleExcludeParticipant(participant.assigned_number, participant.name || "غير محدد")
                                }}
                                className="p-1 rounded-md bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 hover:text-orange-300 transition-all duration-200"
                                title="استبعاد من جميع المطابقات (-1)"
                              >
                                <UserX className="w-3.5 h-3.5" />
                              </button>
                              {/* Ban Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleBanParticipant(participant.assigned_number, participant.name || "غير محدد")
                                }}
                                className="p-1 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 transition-all duration-200"
                                title="حظر نهائي (-10)"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                              {Array.isArray(participant.failed_hard_gates) && participant.failed_hard_gates.length > 0 && (
                                <Tooltip.Provider delayDuration={150}>
                                  <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                      <span className="inline-flex cursor-help items-center gap-1 rounded-full border border-amber-400/35 bg-amber-500/12 px-2 py-1 text-[9px] font-black text-amber-200">
                                        <AlertTriangle className="h-3 w-3" />
                                        بوابات متجاهلة: {participant.failed_hard_gates.length}
                                      </span>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                      <Tooltip.Content sideOffset={6} className="z-[120] w-80 rounded-2xl border border-amber-400/25 bg-slate-950/98 p-3 text-right shadow-2xl shadow-black/60" dir="rtl">
                                        <div className="text-xs font-black text-amber-200">أُدرج هذا الاحتمال للمقارنة رغم البوابات الصارمة</div>
                                        <div className="mt-1 text-[10px] leading-5 text-slate-400">الدرجة معروضة كما حسبها نموذج التوافق؛ هذه القيود لم تُخفِ الصف.</div>
                                        <ul className="mt-2 space-y-1.5">
                                          {participant.failed_hard_gates.map((gate, gateIndex) => (
                                            <li key={`${gate.key ?? gate.label ?? "gate"}-${gateIndex}`} className="rounded-lg border border-white/8 bg-white/[0.035] px-2 py-1.5 text-[10px] text-slate-200">
                                              <b className="text-amber-100">{gate.label || gate.key || "بوابة"}</b>
                                              {gate.detail ? <span className="mt-0.5 block text-slate-400">{gate.detail}</span> : null}
                                            </li>
                                          ))}
                                        </ul>
                                        <Tooltip.Arrow className="fill-amber-400/25" />
                                      </Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                </Tooltip.Provider>
                              )}
                              {participant.is_organizer_match && participant.incompatibility_reason && (
                                <div className="group relative">
                                  <Info className="w-4 h-4 text-yellow-400 cursor-help" />
                                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-80 p-3 bg-gray-900 border border-gray-600 rounded-lg shadow-lg">
                                    <div className="text-sm text-white">
                                      <div className="font-semibold text-red-400 mb-2">أسباب عدم التوافق:</div>
                                      <div className="text-gray-300">{participant.incompatibility_reason}</div>
                                    </div>
                                    <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                            <td className="p-2">
                              {participant.partner_assigned_number ? (
                                <div className="text-slate-300">
                                  {participant.partner_assigned_number === 9999 ? (
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-400" />
                                    <div>
                                      <div className="text-red-400 font-semibold">منظم الحدث</div>
                                      <div className="text-xs text-red-300">لا توجد مطابقة</div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                      <div>
                                        <div className="font-mono">#{participant.partner_assigned_number}</div>
                                        {participant.partner_name && (
                                        <Dialog.Root>
                                          <Dialog.Trigger asChild>
                                            <button
                                              type="button"
                                              className="text-xs text-slate-400 cursor-pointer hover:text-cyan-300 transition-colors"
                                            >
                                              {participant.partner_name}
                                            </button>
                                          </Dialog.Trigger>
                                          <Dialog.Portal>
                                            <Dialog.Overlay className="fixed inset-0 z-[129] bg-slate-950/55 backdrop-blur-[1px]" />
                                            <Dialog.Content
                                              dir="rtl"
                                              className="
                                                fixed left-1/2 top-1/2 z-[130]
                                                w-[min(94vw,680px)]
                                                max-h-[84dvh]
                                                -translate-x-1/2 -translate-y-1/2
                                                overflow-hidden
                                                rounded-xl
                                                border border-cyan-400/30
                                                bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900
                                                shadow-2xl
                                                focus:outline-none
                                              "
                                            >
                                              <Dialog.Close
                                                className="
                                                  absolute left-2 top-2 z-20
                                                  rounded-md bg-white/10 p-1.5
                                                  text-white
                                                  hover:bg-white/20
                                                "
                                                aria-label="إغلاق"
                                              >
                                                <X className="h-4 w-4" />
                                              </Dialog.Close>
                                              <ParticipantHoverCardContent
                                                participantNumber={participant.partner_assigned_number!}
                                                participantName={participant.partner_name}
                                                pData={participantData.get(participant.partner_assigned_number!)}
                                                history={localMatchHistory[participant.partner_assigned_number || 0] || []}
                                                currentEventId={currentEventId}
                                                impressions={impressionsMap[participant.partner_assigned_number || 0] || []}
                                              />
                                            </Dialog.Content>
                                          </Dialog.Portal>
                                        </Dialog.Root>
                                      )}
                                    </div>
                                    {(() => {
                                      // Show yellow alert icon next to the partner name if openness is 0×0 for this pair
                                      const x = participant.assigned_number
                                      const y = participant.partner_assigned_number
                                      if (!y || y === 9999) return null
                                      const pair = getResultPairData(participant)
                                      if (!pair || isSupportedCurrentScoreRow(pair) || isSupportedCurrentScoreRow(participant)) return null
                                      const aData = participantData.get(x)
                                      const bData = participantData.get(y)
                                      const oa = aData?.early_openness_comfort ?? aData?.survey_data?.answers?.early_openness_comfort
                                      const ob = bData?.early_openness_comfort ?? bData?.survey_data?.answers?.early_openness_comfort
                                      const oaNum = Number.parseInt(String(oa ?? ''), 10)
                                      const obNum = Number.parseInt(String(ob ?? ''), 10)
                                      if (oaNum === 0 && obNum === 0) {
                                        return (
                                          <div title="عقوبة الانفتاح 0×0">
                                            <AlertTriangle className="w-4 h-4 text-yellow-400" />
                                          </div>
                                        )
                                      }
                                      return null
                                    })()}
                                    {/* Partner payment indicator */}
                                    {participant.partner_paid_done ? (
                                      <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center" title="الشريك دفع">
                                        <DollarSign className="w-2 h-2 text-white" />
                                      </div>
                                    ) : (
                                      <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center" title="الشريك لم يدفع">
                                        <XCircle className="w-2 h-2 text-white" />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500 text-sm">لا يوجد شريك</span>
                            )}
                          </td>
                          {(() => {
                            const shadow = buildShadowBadges(participant.assigned_number, participant.partner_assigned_number, participantData)
                            return (
                              <td className="p-2 text-center">
                                <div className="flex justify-center">
                                  <div className="flex w-full min-w-0 flex-col gap-1">
                                    <div className="flex w-full min-w-0 items-center justify-center gap-1">
                                    {shadowMetrics.map((metric) => {
                                      const value = shadow[metric.id]
                                      return (
                                        <span
                                          key={metric.id}
                                          className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-sm border px-1 py-0.5 text-center ${
                                            value == null
                                              ? "border-slate-500/30 bg-slate-500/10 text-slate-400"
                                              : value >= 85
                                                ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                                                : value >= 65
                                                  ? "border-cyan-400/30 bg-cyan-500/15 text-cyan-200"
                                                  : value >= 45
                                                    ? "border-amber-400/30 bg-amber-500/15 text-amber-200"
                                                    : "border-red-400/30 bg-red-500/15 text-red-200"
                                          }`}
                                          title={`${metric.label}: ${value == null ? "غير مكتمل" : `${value}%`}`}
                                        >
                                          <span className="block w-full min-w-0 truncate text-[7px] font-medium leading-tight opacity-90">
                                            {metric.label}
                                          </span>
                                          <span className="mt-0 block whitespace-nowrap text-[9px] font-bold leading-none">
                                            {value == null ? "—" : `${value}%`}
                                          </span>
                                   </span>
                                   )})}
                                    <span
                                      className={`flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-sm border px-1 py-0.5 text-center text-[8px] font-bold leading-none ${shadow.overall == null ? "border-slate-500/30 bg-slate-500/10 text-slate-400" : "border-purple-400/30 bg-purple-500/15 text-purple-200"}`}
                                      title={`متوسط محاذاة اللغة والدين والأسلوب الاجتماعي: ${shadow.overall == null ? "غير مكتمل" : `${shadow.overall}%`}`}
                                    >
                                      <span>المتوسط:</span>
                                      <span>{shadow.overall == null ? "—" : `${shadow.overall}%`}</span>
                                    </span>
                                  </div>
                                  </div>
                                </div>
                              </td>
                            )
                          })()}
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {/* Compatibility Score with Tooltip */}
                              {!isSupportedCurrentScoreRow(getResultPairData(participant) ?? participant) && participant.humor_early_openness_bonus && participant.humor_early_openness_bonus !== 'none' ? (
                                <Tooltip.Provider delayDuration={300}>
                                  <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${getScoreBg(resultTotalForDisplay(participant))} cursor-help`}>
                                        <span className={`font-bold ${getScoreColor(resultTotalForDisplay(participant))}`}>
                                          {resultTotalForDisplay(participant)}%
                                        </span>
                                      </div>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                      <Tooltip.Content
                                        className="z-[100] max-w-xs p-3 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-cyan-400/30 rounded-xl shadow-2xl"
                                        sideOffset={5}
                                      >
                                        <div className="space-y-2">
                                          <div className="text-cyan-300 font-bold text-sm">
                                            النتيجة الأصلية (قبل المكافأة):
                                          </div>
                                          <div className="text-white text-lg font-bold">
                                            {Math.round(resultTotalForDisplay(participant) / (participant.humor_early_openness_bonus === 'full' ? 1.15 : 1.05))}%
                                          </div>
                                          <div className="text-slate-400 text-xs border-t border-slate-700 pt-2">
                                            النتيجة بعد المكافأة: {resultTotalForDisplay(participant)}%
                                          </div>
                                        </div>
                                        <Tooltip.Arrow className="fill-cyan-400/30" />
                                      </Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                </Tooltip.Provider>
                              ) : (
                                <div title={`التوافق الإجمالي: ${resultTotalForDisplay(participant)}%`} className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${getScoreBg(resultTotalForDisplay(participant))}`}>
                                  <span className={`font-bold ${getScoreColor(resultTotalForDisplay(participant))}`}>
                                    {resultTotalForDisplay(participant)}%
                                  </span>
                                </div>
                              )}
                              <MatchInsightsCoverageBadge pair={getResultPairData(participant)} />
                              <HistoryConfidenceBadges pair={getResultPairData(participant)} />
                              {!isSupportedCurrentScoreRow(getResultPairData(participant) ?? participant) && (getResultPairData(participant)?.humor_clash_detected || getResultPairData(participant)?.humor_clash_veto_applied) && (
                                <span title="اختلاف أسلوب الدعابة A↔D — الشخص ما زال ضمن النتائج" className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-1 text-[10px] font-black text-amber-200">
                                  <AlertTriangle className="h-3 w-3" /> A↔D
                                </span>
                              )}
                              {/* Humor/Early Openness Bonus Indicator */}
                              {!isSupportedCurrentScoreRow(getResultPairData(participant) ?? participant) && participant.humor_early_openness_bonus && participant.humor_early_openness_bonus !== 'none' && (
                                <Tooltip.Provider delayDuration={300}>
                                  <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                      <div className={`flex items-center justify-center w-6 h-6 rounded-full cursor-help ${
                                        participant.humor_early_openness_bonus === 'full' 
                                          ? 'bg-gradient-to-r from-purple-500 to-pink-500' 
                                          : 'bg-gradient-to-r from-orange-500 to-yellow-500'
                                      }`}>
                                        {participant.humor_early_openness_bonus === 'full' ? (
                                          <Flame className="w-3.5 h-3.5 text-white" />
                                        ) : (
                                          <Sparkles className="w-3.5 h-3.5 text-white" />
                                        )}
                                      </div>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                      <Tooltip.Content
                                        className="z-[100] max-w-xs p-3 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-purple-400/30 rounded-xl shadow-2xl"
                                        sideOffset={5}
                                      >
                                        <div className="space-y-2">
                                          <div className={`font-bold ${
                                            participant.humor_early_openness_bonus === 'full' 
                                              ? 'text-purple-300' 
                                              : 'text-orange-300'
                                          }`}>
                                            {participant.humor_early_openness_bonus === 'full' 
                                              ? '🔥 مكافأة كاملة (×1.15)' 
                                              : '✨ مكافأة جزئية (×1.05)'}
                                          </div>
                                          <div className="text-slate-300 text-sm">
                                            {participant.humor_early_openness_bonus === 'full' 
                                              ? 'تطابق كامل في أسلوب الدعابة والانفتاح المبكر' 
                                              : 'تطابق في أسلوب الدعابة أو الانفتاح المبكر'}
                                          </div>
                                        </div>
                                        <Tooltip.Arrow className="fill-purple-400/30" />
                                      </Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                </Tooltip.Provider>
                              )}
                            </div>
                          </td>
                          {matchType !== "group" && (
                            <td className="p-2 text-center">
                              {participant.partner_assigned_number && participant.partner_assigned_number !== 9999 ? (
                                <button
                                  onClick={() => handleExcludePair(participant.assigned_number, participant.partner_assigned_number!)}
                                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-red-500/20 border border-red-400/30 text-red-300 hover:bg-red-500/30 transition-all duration-300 text-sm"
                                  title="استبعاد هذا الزوج من المطابقات المستقبلية"
                                >
                                  <Ban className="w-3 h-3" />
                                  <span>استبعاد</span>
                                </button>
                              ) : (
                                <span className="text-slate-500 text-xs">غير متاح</span>
                              )}
                            </td>
                          )}
                          {matchType !== "group" && (
                            <td className="p-2 text-center">
                              {participant.partner_assigned_number && participant.partner_assigned_number !== 9999 ? (
                                isMatchLocked(participant.assigned_number, participant.partner_assigned_number) ? (
                                  <button
                                    onClick={() => handleUnlockMatch(participant)}
                                    disabled={loadingLock === participant.assigned_number}
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-red-500/20 border border-red-400/30 text-red-300 hover:bg-red-500/30 transition-all duration-300 text-sm disabled:opacity-50"
                                    title="إلغاء تثبيت المطابقة"
                                  >
                                    <Unlock className="w-3 h-3" />
                                    <span>إلغاء تثبيت</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleLockMatch(participant)}
                                    disabled={loadingLock === participant.assigned_number}
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-green-500/20 border border-green-400/30 text-green-300 hover:bg-green-500/30 transition-all duration-300 text-sm disabled:opacity-50"
                                    title="تثبيت المطابقة للأجيال القادمة"
                                  >
                                    <Lock className="w-3 h-3" />
                                    <span>تثبيت</span>
                                  </button>
                                )
                              ) : (
                                <span className="text-slate-500 text-xs">غير متاح</span>
                              )}
                            </td>
                          )}
                          {matchType !== "group" && (
                            <td className="p-2 text-center">
                              <button
                                onClick={() => fetchParticipantDetails(participant.assigned_number, participant.name)}
                                disabled={loadingDetails}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-500/20 border border-blue-400/30 text-blue-300 hover:bg-blue-500/30 transition-all duration-300 text-sm disabled:opacity-50"
                              >
                                <Eye className="w-3 h-3" />
                                <span>عرض</span>
                              </button>
                            </td>
                          )}
                          {matchType !== "group" && (
                            <td className="p-2 text-center">
                              <button
                                onClick={() => openPairAnalysis(participant)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 hover:bg-purple-500/30 transition-all duration-300"
                                title="تحليل المقارنة"
                              >
                                <Brain className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                          {matchType !== "group" && (
                            <td className="p-2 text-center">
                              <button
                                onClick={() => {
                                  const fullParticipantData = participantData.get(participant.assigned_number)
                                  setWhatsappParticipant(fullParticipantData || {
                                    assigned_number: participant.assigned_number,
                                    name: participant.name,
                                    survey_data: { name: participant.name }
                                  })
                                  setShowWhatsappModal(true)
                                  markMessageSent(participant.assigned_number)
                                }}
                                className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg border transition-all duration-300 text-sm ${
                                  isMessageSent(participant.assigned_number)
                                    ? 'bg-blue-500/20 border-blue-400/30 text-blue-300 hover:bg-blue-500/30'
                                    : 'bg-green-500/20 border-green-400/30 text-green-300 hover:bg-green-500/30'
                                }`}
                                title={isMessageSent(participant.assigned_number) ? 'تم التواصل — فتح واتساب' : 'إرسال رسالة واتساب'}
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>واتساب</span>
                              </button>
                            </td>
                          )}
                          {matchType !== "group" && (() => {
                            const pair = getResultPairData(participant)
                            const pairForDisplay = pair
                            const supportedCurrent = isSupportedCurrentScoreRow(pairForDisplay ?? participant)
                            const hasAny = !supportedCurrent && pairForDisplay && (pairForDisplay.intent_boost_applied || pairForDisplay.attachment_penalty_applied || pairForDisplay.dead_air_veto_applied || pairForDisplay.humor_clash_detected || pairForDisplay.humor_clash_veto_applied || pairForDisplay.cap_applied != null || (pairForDisplay.humor_early_openness_bonus && pairForDisplay.humor_early_openness_bonus !== 'none'))
                            const hasStructuredTolerance = pair && (
                              typeof pair.age_tolerance_used_a === 'boolean' ||
                              typeof pair.age_tolerance_used_b === 'boolean'
                            )
                            const tolerated = !!pair && (hasStructuredTolerance
                              ? (pair.age_tolerance_used_a || pair.age_tolerance_used_b)
                              : (typeof pair.reason === 'string' && pair.reason.includes('±1y')))
                            const hasDeadAirPenalty = !supportedCurrent && !!pairForDisplay?.dead_air_veto_applied
                            const flexDecision = getAgeFlexDecision(participant.assigned_number)
                            const toleranceStyle = flexDecision === 'accepted'
                              ? 'bg-green-500/20 border-green-400/30 text-green-300'
                              : flexDecision === 'declined'
                                ? 'bg-red-500/20 border-red-400/30 text-red-300'
                                : 'bg-yellow-500/20 border-yellow-400/30 text-yellow-300'
                            const toleranceTitle = flexDecision === 'accepted'
                              ? 'حالة مرونة ±1 سنة: وافق المشارك'
                              : flexDecision === 'declined'
                                ? 'حالة مرونة ±1 سنة: رفض المشارك'
                                : 'حالة مرونة ±1 سنة: لم يرسل المشارك اختياره بعد'
                            return (
                              <td className="p-2 text-center">
                                {(hasAny || tolerated) ? (
                                  <div className="inline-flex items-center gap-2 justify-center">
                                    {hasDeadAirPenalty && (
                                      <span className="inline-flex items-center rounded-full border border-red-400/40 bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-200">
                                        صمت
                                      </span>
                                    )}
                                    {hasAny && (
                                      <Tooltip.Provider delayDuration={200}>
                                        <Tooltip.Root>
                                          <Tooltip.Trigger asChild>
                                            <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-200 cursor-help">
                                              <Info className="w-4 h-4" />
                                            </div>
                                          </Tooltip.Trigger>
                                          <Tooltip.Portal>
                                            <Tooltip.Content sideOffset={6} className="z-[101] max-w-sm px-3 py-2 text-sm text-white bg-slate-900 border border-slate-700 rounded-lg shadow-xl" dir="rtl">
                                              <div className="space-y-1">
                                                {(() => {
                                                  const x = participant.assigned_number
                                                  const y = participant.partner_assigned_number
                                                  if (!y) return null
                                                  if (!pair) return null
                                                  const own = pair.participant_a === x ? (pair.intent_a || '') : (pair.intent_b || '')
                                                  const other = pair.participant_a === x ? (pair.intent_b || '') : (pair.intent_a || '')
                                                  if (own === 'B' && other && other !== 'B') {
                                                    return (
                                                      <div className="text-red-300">• اختلاف الهدف: B × {other}</div>
                                                    )
                                                  }
                                                  if (other === 'B' && own && own !== 'B') {
                                                    return (
                                                      <div className="text-red-300">• اختلاف الهدف: {own} × B</div>
                                                    )
                                                  }
                                                  return null
                                                })()}
                                                {(() => {
                                                  const x = participant.assigned_number
                                                  const y = participant.partner_assigned_number
                                                  if (!y) return null
                                                  if (!pair) return null
                                                  const own = pair.participant_a === x ? (pair.intent_a || '') : (pair.intent_b || '')
                                                  const other = pair.participant_a === x ? (pair.intent_b || '') : (pair.intent_a || '')
                                                  return (
                                                    <>
                                                      <div className="text-slate-300">• هدف (المشارك): {own || 'غير محدد'}</div>
                                                      <div className="text-slate-300">• هدف (الشريك): {other || 'غير محدد'}</div>
                                                    </>
                                                  )
                                                })()}
                                                {(() => {
                                                  // Show both people's openness to different goals
                                                  const x = participant.assigned_number
                                                  const y = participant.partner_assigned_number
                                                  if (!y) return null
                                                  const aData = participantData.get(x)
                                                  const bData = participantData.get(y)
                                                  const ansA = aData?.survey_data?.answers || {}
                                                  const ansB = bData?.survey_data?.answers || {}
                                                  const openA = (aData?.open_intent_goal_mismatch === true) || (ansA.open_intent_goal_mismatch === true) || (ansA.open_intent_goal_mismatch === 'true')
                                                  const openB = (bData?.open_intent_goal_mismatch === true) || (ansB.open_intent_goal_mismatch === true) || (ansB.open_intent_goal_mismatch === 'true')
                                                  return (
                                                    <>
                                                      <div className="text-slate-300">• قبول اختلاف الهدف (المشارك): {openA ? 'نعم' : 'لا'}</div>
                                                      <div className="text-slate-300">• قبول اختلاف الهدف (الشريك): {openB ? 'نعم' : 'لا'}</div>
                                                    </>
                                                  )
                                                })()}
                                                {(() => {
                                                  // Add openness 0×0 penalty line inside constraints tooltip when both are 0
                                                  const x = participant.assigned_number
                                                  const y = participant.partner_assigned_number
                                                  if (!y) return null
                                                  if (!pair) return null
                                                  const aData = participantData.get(x)
                                                  const bData = participantData.get(y)
                                                  const oa = aData?.early_openness_comfort ?? aData?.survey_data?.answers?.early_openness_comfort
                                                  const ob = bData?.early_openness_comfort ?? bData?.survey_data?.answers?.early_openness_comfort
                                                  const oaNum = Number.parseInt(String(oa ?? ''), 10)
                                                  const obNum = Number.parseInt(String(ob ?? ''), 10)
                                                  if (oaNum === 0 && obNum === 0) {
                                                    return (
                                                      <div className="text-red-300">• عقوبة الانفتاح 0×0 −5</div>
                                                    )
                                                  }
                                                  return null
                                                })()}
                                                {pair?.humor_early_openness_bonus && pair.humor_early_openness_bonus !== 'none' && (
                                                  <div className="text-amber-300">• مكافأة الدعابة/الانفتاح: {pair.humor_early_openness_bonus === 'full' ? 'كاملة (×1.15)' : 'جزئية (×1.05)'}
                                                  </div>
                                                )}
                                                {pair?.intent_boost_applied && (
                                                  <div className="text-emerald-300">• مضاعف الهدف (×1.1) مطبق</div>
                                                )}
                                                {pair?.attachment_penalty_applied && (
                                                  <div className="text-red-300">• عقوبة تعلق (قلق × تجنُّب) −5</div>
                                                )}
                                                {pair?.dead_air_veto_applied && (
                                                  <div className="text-red-300">• قيد الصمت: فئة التفاعل 0/3</div>
                                                )}
                                                {(pair?.humor_clash_detected || pair?.humor_clash_veto_applied) && (
                                                  <div className="text-amber-300">• اختلاف الدعابة A↔D: الشخص متاح{pair?.humor_clash_veto_applied ? '، وتم تقييد الدرجة إلى 50%' : ''}</div>
                                                )}
                                                {pair?.cap_applied != null && (
                                                  <div className="text-yellow-300">• تقييد نهائي: {pair.cap_applied}%</div>
                                                )}
                                                {pair?.reason && (
                                                  <div className="text-slate-300 border-t border-slate-700 pt-1 mt-1">{pair.reason}</div>
                                                )}
                                              </div>
                                              <Tooltip.Arrow className="fill-slate-900" />
                                            </Tooltip.Content>
                                          </Tooltip.Portal>
                                        </Tooltip.Root>
                                      </Tooltip.Provider>
                                    )}
                                    {tolerated && (
                                      <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full border ${toleranceStyle}`} title={toleranceTitle}>
                                        <span className="text-[11px] font-bold">±1</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-500 text-xs">—</span>
                                )}
                              </td>
                            )
                          })()}
                          {matchType !== "group" && (() => {
                            const pair = getResultPairData(participant)
                            const pairForDisplay = pair ?? participant
                            if (!isSupportedCurrentScoreRow(pairForDisplay)) {
                              return (
                                <td
                                  colSpan={matchType === "ai" ? 12 : 11}
                                  className="p-2 text-center text-xs text-slate-500"
                                  title="The historical total is preserved, but no exact current-model component snapshot exists for this match."
                                >
                                  المجموع التاريخي محفوظ — تفاصيل المكونات غير متاحة بأمان
                                </td>
                              )
                            }
                            const oppositesDimensions = currentOppositesDimensionsForDisplay(pairForDisplay)
                            if (oppositesDimensions) {
                              return (
                                <td colSpan={matchType === "ai" ? 12 : 11} className="p-2">
                                  <div className="min-w-[680px] rounded-lg border border-violet-400/20 bg-violet-500/5 px-2.5 py-2">
                                    <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold text-violet-200">
                                      <span>وضع الأضداد الحالي · لقطة وقت المطابقة</span>
                                      <span className="text-violet-300/80">76 نقطة خام ← 100</span>
                                    </div>
                                    <div className="grid grid-cols-6 gap-1.5">
                                      {oppositesDimensions.map(dimension => (
                                        <div key={dimension.key} className="rounded-md border border-white/10 bg-slate-950/30 px-2 py-1.5 text-center">
                                          <div className="truncate text-[9px] text-slate-400" title={dimension.label}>{dimension.label}</div>
                                          <div className="mt-0.5 text-xs font-bold text-slate-100">{dimension.value !== null ? dimension.value.toFixed(1) : "—"}/{dimension.max}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              )
                            }
                            const dimensions = currentBalancedDimensionsForDisplay(pairForDisplay) || []
                            const dimension = (key: string) => dimensions.find(item => item.key === key)
                            const subtotalKeys = ["vibe", "disagreement", "focus", "similarity", "attachment", "lifestyle"]
                            const subtotalValues = subtotalKeys.map(key => dimension(key)?.value ?? null)
                            const contextLifeSubtotal = subtotalValues.every(value => value !== null)
                              ? subtotalValues.reduce<number>((sum, value) => sum + (value ?? 0), 0)
                              : null
                            const cell = (key: string, tone = "text-slate-300") => {
                              const item = dimension(key)
                              return <td className="p-2 text-center"><span className={`${tone} text-sm`}>{item?.value !== null && item?.value !== undefined ? `${item.value.toFixed(1)}/${item.max}` : "—"}</span></td>
                            }
                            return (
                              <>
                                {cell("synergy")}
                                {cell("disagreement", "text-cyan-200 font-semibold")}
                                {cell("focus", "text-cyan-200 font-semibold")}
                                {cell("similarity", "text-cyan-200 font-semibold")}
                                {cell("attachment", "text-cyan-200 font-semibold")}
                                {cell("lifestyle")}
                                {cell("humor")}
                                {cell("communication")}
                                {cell("values")}
                                {cell("intent")}
                                {matchType === "ai" && (
                                  cell("vibe")
                                )}
                                <td className="p-2 text-center"><span className="text-purple-200 text-sm font-bold">{contextLifeSubtotal !== null ? `${contextLifeSubtotal.toFixed(1)}/43` : "—"}</span></td>
                              </>
                            )
                          })()}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`shrink-0 border-t p-4 ${cohostTheme ? 'border-rose-400/20 bg-rose-500/10' : 'border-white/20 bg-white/5'}`}>
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-400">
              تم إنشاء {totalMatches} مطابقة بنجاح
            </div>
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl transition-all duration-300 text-white ${cohostTheme ? 'bg-rose-600 hover:bg-rose-700' : 'bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800'}`}
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>

      {/* Participant Detail Modal */}
      <ParticipantDetailModal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        participant={selectedParticipant}
        matches={participantMatches}
        matchType={matchType}
        swapMode={false}
        onSwapSelect={async () => {}}
        lockedMatches={lockedMatches}
        cohostTheme={cohostTheme}
      />

      {/* WhatsApp Message Modal */}
      <WhatsappMessageModal
        participant={whatsappParticipant}
        isOpen={showWhatsappModal}
        onClose={() => {
          setShowWhatsappModal(false)
          setWhatsappParticipant(null)
        }}
        cohostTheme={cohostTheme}
      />

      {/* Pair Analysis Modal */}
      <PairAnalysisModal
        open={showPairAnalysis}
        onOpenChange={setShowPairAnalysis}
        a={analysisA}
        b={analysisB}
        pair={analysisPair}
        historyA={analysisA?.assigned_number ? (localMatchHistory[analysisA.assigned_number] || []) : []}
        historyB={analysisB?.assigned_number ? (localMatchHistory[analysisB.assigned_number] || []) : []}
        currentEventId={currentEventId}
      />
    </div>
  )
}
