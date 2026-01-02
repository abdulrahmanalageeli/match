import { useState, useEffect } from "react"
import { X, Users, Heart, Trophy, Star, Eye, ArrowUpDown, CheckCircle, XCircle, AlertTriangle, Zap, Brain, MessageCircle, Home, DollarSign, Info, ArrowLeftRight, Lock, Unlock, MessageSquare, Ban, UserX, Sparkles, Flame } from "lucide-react"
import ParticipantDetailModal from "./ParticipantDetailModal"
import WhatsappMessageModal from "./WhatsappMessageModal"
import PairAnalysisModal from "./PairAnalysisModalPro"
import * as Tooltip from "@radix-ui/react-tooltip"

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
  attachment_penalty_applied?: boolean
  intent_boost_applied?: boolean
  dead_air_veto_applied?: boolean
  humor_clash_veto_applied?: boolean
  humor_multiplier?: number
  cap_applied?: number | null
  partner_assigned_number?: number
  partner_name?: string
  is_organizer_match?: boolean
  incompatibility_reason?: string
  paid_done?: boolean
  partner_paid_done?: boolean
  humor_early_openness_bonus?: 'full' | 'partial' | 'none'
}

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
  cohostTheme = false
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
      // Fetch match history for tooltips
      fetchAllMatchHistoryForModal()
      fetchLockedMatches()
      fetchParticipantData()
    }
  }, [isOpen, results])

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
          compatibilityScore: participant.compatibility_score,
          round: 1,
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

  if (!isOpen) return null

  // Remove duplicates and sort results by compatibility score (descending)
  // For individual matching, only show each participant once (keep the higher score if duplicated)
  let processedResults = results
  
  if (matchType !== "group") {
    const participantMap = new Map()
    
    results.forEach(result => {
      const existing = participantMap.get(result.assigned_number)
      if (!existing || result.compatibility_score > existing.compatibility_score) {
        participantMap.set(result.assigned_number, result)
      }
    })
    
    processedResults = Array.from(participantMap.values())
  }
  
  const sortedResults = [...processedResults].sort((a, b) => b.compatibility_score - a.compatibility_score)

  const fetchParticipantDetails = (participantNumber: number, participantName: string) => {
    setLoadingDetails(true)
    
    // Filter calculated pairs to get all matches for this participant
    const participantPairs = calculatedPairs.filter(pair => 
      pair.participant_a === participantNumber || pair.participant_b === participantNumber
    )
    
    // Convert to the format expected by ParticipantDetailModal
    const matches = participantPairs.map(pair => {
      const otherParticipantNumber = pair.participant_a === participantNumber ? pair.participant_b : pair.participant_a
      
      // Try to find name from multiple sources
      const otherParticipantFromResults = results.find(r => r.assigned_number === otherParticipantNumber)
      const otherParticipantFromData = participantData.get(otherParticipantNumber)
      
      // Get name from available sources
      const otherParticipantName = otherParticipantFromResults?.name || 
                                   otherParticipantFromData?.name ||
                                   otherParticipantFromData?.survey_data?.name ||
                                   otherParticipantFromData?.survey_data?.answers?.name ||
                                   `المشارك #${otherParticipantNumber}`
      
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
        // Gates & bonuses
        attachment_penalty_applied: pair.attachment_penalty_applied,
        intent_boost_applied: pair.intent_boost_applied,
        dead_air_veto_applied: pair.dead_air_veto_applied,
        humor_clash_veto_applied: pair.humor_clash_veto_applied,
        cap_applied: pair.cap_applied,
        reason: pair.reason,
        is_actual_match: pair.is_actual_match,
        is_repeated_match: pair.is_repeated_match,
        humor_early_openness_bonus: pair.humor_early_openness_bonus
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

  // Open pair analysis for a specific row
  const openPairAnalysis = (participant: ParticipantResult) => {
    if (!participant.partner_assigned_number || participant.partner_assigned_number === 9999) return
    // find pair from calculatedPairs
    const pair = (calculatedPairs || []).find((p: any) => {
      const a = p.participant_a
      const b = p.participant_b
      const x = participant.assigned_number
      const y = participant.partner_assigned_number
      if (!y) return false
      return (a === x && b === y) || (a === y && b === x)
    })
    // full participant rows (with survey_data)
    const aFull = participantData.get(participant.assigned_number)
    const bFull = participantData.get(participant.partner_assigned_number)
    setAnalysisA(aFull || null)
    setAnalysisB(bFull || null)
    setAnalysisPair(pair || null)
    setShowPairAnalysis(true)
  }

  return (
    <div className={`fixed inset-0 ${cohostTheme ? 'bg-rose-900/40' : 'bg-black/50'} backdrop-blur-sm z-50 flex items-center justify-center p-4`}>
      <div className={`${cohostTheme ? 'bg-gradient-to-br from-rose-950 via-slate-900 to-rose-950 border-4 border-rose-400/30 rounded-3xl' : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/20 rounded-2xl'} shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden`}>
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

        {/* Weights Legend */}
        {matchType !== "group" && (
          <div className="mx-6 mt-3 mb-1 text-xs text-slate-300/80">
            <div className="inline-flex flex-wrap items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
              <span className="font-semibold text-slate-200">معادلة 100 نقطة:</span>
              <span>التفاعل 35</span>
              <span>الطاقة 20</span>
              <span>نمط الحياة 15</span>
              <span>الدعابة/الانفتاح 15</span>
              <span>التواصل 10</span>
              <span>الأهداف 5</span>
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

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {results.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">لا توجد نتائج</h3>
              <p className="text-slate-400">لم يتم العثور على مطابقات للمشاركين</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-slate-300">إجمالي المشاركين</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{sortedResults.length}</div>
                </div>
                
                <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Heart className="w-4 h-4 text-pink-400" />
                    <span className="text-sm text-slate-300">متوسط التوافق</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {sortedResults.length > 0 ? Math.round(sortedResults.reduce((sum, r) => sum + r.compatibility_score, 0) / sortedResults.length) : 0}%
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm text-slate-300">أعلى توافق</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {sortedResults.length > 0 ? Math.max(...sortedResults.map(r => r.compatibility_score)) : 0}%
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-slate-300">إجمالي المطابقات</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{totalMatches}</div>
                </div>
              </div>

              {/* Participants Table */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-white/10">
                      <tr>
                        <th className="text-right p-4 text-sm font-semibold text-slate-300">رقم المشارك</th>
                        <th className="text-right p-4 text-sm font-semibold text-slate-300">الاسم</th>
                        <th className="text-right p-4 text-sm font-semibold text-slate-300">الشريك</th>
                        <th className="text-center p-4 text-sm font-semibold text-slate-300">التوافق الإجمالي</th>
                        {matchType !== "group" && (
                          <th className="text-center p-4 text-sm font-semibold text-slate-300">استبعاد</th>
                        )}
                        {matchType !== "group" && (
                          <th className="text-center p-4 text-sm font-semibold text-slate-300">تثبيت التوافق</th>
                        )}
                        {matchType !== "group" && (
                          <th className="text-center p-4 text-sm font-semibold text-slate-300">عرض التفاصيل</th>
                        )}
                        {matchType !== "group" && (
                          <th className="text-center p-4 text-sm font-semibold text-slate-300">تحليل</th>
                        )}
                        {matchType !== "group" && (
                          <th className="text-center p-4 text-sm font-semibold text-slate-300">واتساب</th>
                        )}
                        {matchType !== "group" && (
                          <th className="text-center p-4 text-sm font-semibold text-slate-300">القيود/المكافآت</th>
                        )}
                        {matchType !== "group" && (
                          <>
                            <th className="text-center p-4 text-sm font-semibold text-slate-300">
                              <div className="flex items-center justify-center gap-1">
                                <Users className="w-3 h-3" />
                                <span className="text-xs">التفاعل</span>
                              </div>
                            </th>
                            <th className="text-center p-4 text-sm font-semibold text-slate-300">
                              <div className="flex items-center justify-center gap-1">
                                <Home className="w-3 h-3" />
                                <span className="text-xs">نمط الحياة</span>
                              </div>
                            </th>
                            <th className="text-center p-4 text-sm font-semibold text-slate-300">
                              <div className="flex items-center justify-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                <span className="text-xs">الدعابة/الانفتاح</span>
                              </div>
                            </th>
                            <th className="text-center p-4 text-sm font-semibold text-slate-300">
                              <div className="flex items-center justify-center gap-1">
                                <MessageCircle className="w-3 h-3" />
                                <span className="text-xs">التواصل</span>
                              </div>
                            </th>
                            <th className="text-center p-4 text-sm font-semibold text-slate-300">
                              <div className="flex items-center justify-center gap-1">
                                <Star className="w-3 h-3" />
                                <span className="text-xs">الأهداف/القيم</span>
                              </div>
                            </th>
                            {matchType === "ai" && (
                              <th className="text-center p-4 text-sm font-semibold text-slate-300">
                                <div className="flex items-center justify-center gap-1">
                                  <Zap className="w-3 h-3" />
                                  <span className="text-xs">الطاقة</span>
                                </div>
                              </th>
                            )}
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedResults.map((participant, index) => (
                        <tr 
                          key={participant.id} 
                          className={`border-t border-white/10 hover:bg-white/5 transition-colors ${
                            participant.is_organizer_match 
                              ? 'bg-gradient-to-r from-red-500/10 to-transparent border-red-500/20' 
                              : index < 3 ? 'bg-gradient-to-r from-yellow-500/10 to-transparent' : ''
                          }`}
                        >
                          <td className="p-4">
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
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <Tooltip.Provider delayDuration={300}>
                                <Tooltip.Root>
                                  <Tooltip.Trigger asChild>
                                    <span className="text-white font-medium cursor-help hover:text-cyan-300 transition-colors">
                                      {participant.name || "غير محدد"}
                                    </span>
                                  </Tooltip.Trigger>
                                  <Tooltip.Portal>
                                    <Tooltip.Content
                                      className="z-[100] max-w-4xl p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-cyan-400/30 rounded-xl shadow-2xl"
                                      sideOffset={5}
                                    >
                                      {(() => {
                                        const pData = participantData.get(participant.assigned_number)
                                        const surveyData = pData?.survey_data || {}
                                        const answers = surveyData.answers || {}
                                        
                                        return (
                                          <div className="space-y-2">
                                            {/* Header */}
                                            <div className="border-b border-cyan-400/20 pb-2 flex items-center justify-between" dir="rtl">
                                              <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-cyan-300 font-bold text-lg">{participant.name || "غير محدد"}</span>
                                                  <span className="text-slate-400 text-sm">#{participant.assigned_number}</span>
                                                </div>
                                                {pData?.updated_at && (
                                                  <span className="text-xs text-slate-500">
                                                    🕐 {(() => {
                                                      const utcDate = new Date(pData.updated_at);
                                                      const gmt3Date = new Date(utcDate.getTime() + (3 * 60 * 60 * 1000));
                                                      const now = new Date();
                                                      const diffMs = now.getTime() - gmt3Date.getTime();
                                                      const diffMins = Math.floor(diffMs / 60000);
                                                      const diffHours = Math.floor(diffMs / 3600000);
                                                      const diffDays = Math.floor(diffMs / 86400000);
                                                      
                                                      if (diffMins < 1) return 'Just now';
                                                      if (diffMins < 60) return `${diffMins}m ago`;
                                                      if (diffHours < 24) return `${diffHours}h ago`;
                                                      if (diffDays === 1) return '1d ago';
                                                      if (diffDays < 30) return `${diffDays}d ago`;
                                                      
                                                      return gmt3Date.toLocaleDateString('en-GB', { 
                                                        day: '2-digit', 
                                                        month: 'short',
                                                        year: 'numeric'
                                                      });
                                                    })()}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex gap-3 text-xs">
                                                <span className="text-slate-400">العمر: <span className="text-white">{answers.age || surveyData.age || "غير محدد"}</span></span>
                                                <span className="text-slate-400">MBTI: <span className="text-white">{pData?.mbti_personality_type || answers.mbti || "غير محدد"}</span></span>
                                              </div>
                                            </div>
                                            
                                            {/* Main Content - 2 Column Layout */}
                                            <div className="grid grid-cols-3 gap-4">
                                              {/* Left Column - Vibe Info */}
                                              <div className="col-span-2 space-y-1.5">
                                                <div className="text-cyan-300 font-semibold text-xs mb-1">الطاقة والشخصية:</div>
                                                
                                                {answers.vibe_1 && (
                                                  <div className="text-xs">
                                                    <span className="text-slate-400">الويكند المثالي:</span>
                                                    <span className="text-white ml-1">{answers.vibe_1}</span>
                                                  </div>
                                                )}
                                                
                                                {answers.vibe_2 && (
                                                  <div className="text-xs">
                                                    <span className="text-slate-400">الهوايات:</span>
                                                    <span className="text-white ml-1">{answers.vibe_2}</span>
                                                  </div>
                                                )}
                                                
                                                {answers.vibe_3 && (
                                                  <div className="text-xs">
                                                    <span className="text-slate-400">الفنان المفضل:</span>
                                                    <span className="text-white ml-1">{answers.vibe_3}</span>
                                                  </div>
                                                )}
                                                
                                                {answers.vibe_4 && (
                                                  <div className="text-xs">
                                                    <span className="text-slate-400">السوالف العميقة:</span>
                                                    <span className="text-white ml-1">{answers.vibe_4}</span>
                                                  </div>
                                                )}
                                                
                                                {answers.vibe_5 && (
                                                  <div className="text-xs">
                                                    <span className="text-slate-400">كيف يصفك أصدقاؤك:</span>
                                                    <span className="text-white ml-1">{answers.vibe_5}</span>
                                                  </div>
                                                )}
                                                
                                                {answers.vibe_6 && (
                                                  <div className="text-xs">
                                                    <span className="text-slate-400">كيف تصف أصدقاءك:</span>
                                                    <span className="text-white ml-1">{answers.vibe_6}</span>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Right Column - Previous Matches */}
                                              {localMatchHistory[participant.assigned_number] && localMatchHistory[participant.assigned_number].length > 0 && (
                                                <div className="border-l border-cyan-400/20 pl-4">
                                                  <div className="text-cyan-300 font-semibold text-xs mb-1">Previous Matches:</div>
                                                  <div className="space-y-0.5">
                                                    {localMatchHistory[participant.assigned_number].slice(0, 5).map((match: any, idx: number) => (
                                                      <div key={idx} className="flex items-center justify-between text-xs bg-white/5 rounded px-1.5 py-0.5">
                                                        <div className="flex items-center gap-1">
                                                          <span className="text-cyan-400">#{match.partner_number}</span>
                                                          <span className="text-slate-400 truncate max-w-[100px]">{match.partner_name}</span>
                                                        </div>
                                                        {match.event_id && match.event_id !== currentEventId && (
                                                          <span className="text-xs text-purple-400">E{match.event_id}</span>
                                                        )}
                                                      </div>
                                                    ))}
                                                    {localMatchHistory[participant.assigned_number].length > 5 && (
                                                      <div className="text-xs text-slate-500 text-center">
                                                        +{localMatchHistory[participant.assigned_number].length - 5} more
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )
                                      })()}
                                      <Tooltip.Arrow className="fill-cyan-400/30" />
                                    </Tooltip.Content>
                                  </Tooltip.Portal>
                                </Tooltip.Root>
                              </Tooltip.Provider>
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
                          <td className="p-4">
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
                                        <Tooltip.Provider delayDuration={300}>
                                          <Tooltip.Root>
                                            <Tooltip.Trigger asChild>
                                              <div className="text-xs text-slate-400 cursor-help hover:text-cyan-300 transition-colors">{participant.partner_name}</div>
                                            </Tooltip.Trigger>
                                            <Tooltip.Portal>
                                              <Tooltip.Content
                                                className="z-[100] max-w-4xl p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-cyan-400/30 rounded-xl shadow-2xl"
                                                sideOffset={5}
                                              >
                                                {(() => {
                                                  const pData = participantData.get(participant.partner_assigned_number!)
                                                  const surveyData = pData?.survey_data || {}
                                                  const answers = surveyData.answers || {}
                                                  
                                                  return (
                                                    <div className="space-y-2">
                                                      {/* Header */}
                                                      <div className="border-b border-cyan-400/20 pb-2 flex items-center justify-between" dir="rtl">
                                                        <div className="flex items-center gap-3">
                                                          <div className="flex items-center gap-2">
                                                            <span className="text-cyan-300 font-bold text-lg">{participant.partner_name}</span>
                                                            <span className="text-slate-400 text-sm">#{participant.partner_assigned_number}</span>
                                                          </div>
                                                          {pData?.updated_at && (
                                                            <span className="text-xs text-slate-500">
                                                              🕐 {(() => {
                                                                const utcDate = new Date(pData.updated_at);
                                                                const gmt3Date = new Date(utcDate.getTime() + (3 * 60 * 60 * 1000));
                                                                const now = new Date();
                                                                const diffMs = now.getTime() - gmt3Date.getTime();
                                                                const diffMins = Math.floor(diffMs / 60000);
                                                                const diffHours = Math.floor(diffMs / 3600000);
                                                                const diffDays = Math.floor(diffMs / 86400000);
                                                                
                                                                if (diffMins < 1) return 'Just now';
                                                                if (diffMins < 60) return `${diffMins}m ago`;
                                                                if (diffHours < 24) return `${diffHours}h ago`;
                                                                if (diffDays === 1) return '1d ago';
                                                                if (diffDays < 30) return `${diffDays}d ago`;
                                                                
                                                                return gmt3Date.toLocaleDateString('en-GB', { 
                                                                  day: '2-digit', 
                                                                  month: 'short',
                                                                  year: 'numeric'
                                                                });
                                                              })()}
                                                            </span>
                                                          )}
                                                        </div>
                                                        <div className="flex gap-3 text-xs">
                                                          <span className="text-slate-400">العمر: <span className="text-white">{answers.age || surveyData.age || "غير محدد"}</span></span>
                                                          <span className="text-slate-400">MBTI: <span className="text-white">{pData?.mbti_personality_type || answers.mbti || "غير محدد"}</span></span>
                                                        </div>
                                                      </div>
                                                      
                                                      {/* Main Content - 2 Column Layout */}
                                                      <div className="grid grid-cols-3 gap-4">
                                                        {/* Left Column - Vibe Info */}
                                                        <div className="col-span-2 space-y-1.5">
                                                          <div className="text-cyan-300 font-semibold text-xs mb-1">الطاقة والشخصية:</div>
                                                          
                                                          {answers.vibe_1 && (
                                                            <div className="text-xs">
                                                              <span className="text-slate-400">الويكند المثالي:</span>
                                                              <span className="text-white ml-1">{answers.vibe_1}</span>
                                                            </div>
                                                          )}
                                                          
                                                          {answers.vibe_2 && (
                                                            <div className="text-xs">
                                                              <span className="text-slate-400">الهوايات:</span>
                                                              <span className="text-white ml-1">{answers.vibe_2}</span>
                                                            </div>
                                                          )}
                                                          
                                                          {answers.vibe_3 && (
                                                            <div className="text-xs">
                                                              <span className="text-slate-400">الفنان المفضل:</span>
                                                              <span className="text-white ml-1">{answers.vibe_3}</span>
                                                            </div>
                                                          )}
                                                          
                                                          {answers.vibe_4 && (
                                                            <div className="text-xs">
                                                              <span className="text-slate-400">السوالف العميقة:</span>
                                                              <span className="text-white ml-1">{answers.vibe_4}</span>
                                                            </div>
                                                          )}
                                                          
                                                          {answers.vibe_5 && (
                                                            <div className="text-xs">
                                                              <span className="text-slate-400">كيف يصفك أصدقاؤك:</span>
                                                              <span className="text-white ml-1">{answers.vibe_5}</span>
                                                            </div>
                                                          )}
                                                          
                                                          {answers.vibe_6 && (
                                                            <div className="text-xs">
                                                              <span className="text-slate-400">كيف تصف أصدقاءك:</span>
                                                              <span className="text-white ml-1">{answers.vibe_6}</span>
                                                            </div>
                                                          )}
                                                        </div>

                                                        {/* Right Column - Previous Matches */}
                                                        {localMatchHistory[participant.partner_assigned_number || 0] && localMatchHistory[participant.partner_assigned_number || 0].length > 0 && (
                                                          <div className="border-l border-cyan-400/20 pl-4">
                                                            <div className="text-cyan-300 font-semibold text-xs mb-1">Previous Matches:</div>
                                                            <div className="space-y-0.5">
                                                              {localMatchHistory[participant.partner_assigned_number || 0].slice(0, 5).map((match: any, idx: number) => (
                                                                <div key={idx} className="flex items-center justify-between text-xs bg-white/5 rounded px-1.5 py-0.5">
                                                                  <div className="flex items-center gap-1">
                                                                    <span className="text-cyan-400">#{match.partner_number}</span>
                                                                    <span className="text-slate-400 truncate max-w-[100px]">{match.partner_name}</span>
                                                                  </div>
                                                                  {match.event_id && match.event_id !== currentEventId && (
                                                                    <span className="text-xs text-purple-400">E{match.event_id}</span>
                                                                  )}
                                                                </div>
                                                              ))}
                                                              {localMatchHistory[participant.partner_assigned_number || 0].length > 5 && (
                                                                <div className="text-xs text-slate-500 text-center">
                                                                  +{localMatchHistory[participant.partner_assigned_number || 0].length - 5} more
                                                                </div>
                                                              )}
                                                            </div>
                                                          </div>
                                                        )}
                                                      </div>
                                                    </div>
                                                  )
                                                })()}
                                                <Tooltip.Arrow className="fill-cyan-400/30" />
                                              </Tooltip.Content>
                                            </Tooltip.Portal>
                                          </Tooltip.Root>
                                        </Tooltip.Provider>
                                      )}
                                    </div>
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
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {/* Compatibility Score with Tooltip */}
                              {participant.humor_early_openness_bonus && participant.humor_early_openness_bonus !== 'none' ? (
                                <Tooltip.Provider delayDuration={300}>
                                  <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${getScoreBg(participant.compatibility_score)} cursor-help`}>
                                        <span className={`font-bold ${getScoreColor(participant.compatibility_score)}`}>
                                          {participant.compatibility_score}%
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
                                            {Math.round(participant.compatibility_score / (participant.humor_early_openness_bonus === 'full' ? 1.15 : 1.05))}%
                                          </div>
                                          <div className="text-slate-400 text-xs border-t border-slate-700 pt-2">
                                            النتيجة بعد المكافأة: {participant.compatibility_score}%
                                          </div>
                                        </div>
                                        <Tooltip.Arrow className="fill-cyan-400/30" />
                                      </Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                </Tooltip.Provider>
                              ) : (
                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${getScoreBg(participant.compatibility_score)}`}>
                                  <span className={`font-bold ${getScoreColor(participant.compatibility_score)}`}>
                                    {participant.compatibility_score}%
                                  </span>
                                </div>
                              )}
                              {/* Humor/Early Openness Bonus Indicator */}
                              {participant.humor_early_openness_bonus && participant.humor_early_openness_bonus !== 'none' && (
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
                            <td className="p-4 text-center">
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
                            <td className="p-4 text-center">
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
                            <td className="p-4 text-center">
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
                            <td className="p-4 text-center">
                              {participant.partner_assigned_number && participant.partner_assigned_number !== 9999 ? (
                                <button
                                  onClick={() => openPairAnalysis(participant)}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 hover:bg-purple-500/30 transition-all duration-300"
                                  title="تحليل المقارنة"
                                >
                                  <Brain className="w-4 h-4" />
                                </button>
                              ) : (
                                <span className="text-slate-500 text-xs">غير متاح</span>
                              )}
                            </td>
                          )}
                          {matchType !== "group" && (
                            <td className="p-4 text-center">
                              <button
                                onClick={() => {
                                  // Get full participant data from participantData map
                                  const fullParticipantData = participantData.get(participant.assigned_number)
                                  setWhatsappParticipant(fullParticipantData || {
                                    assigned_number: participant.assigned_number,
                                    name: participant.name,
                                    survey_data: { name: participant.name }
                                  })
                                  setShowWhatsappModal(true)
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-green-500/20 border border-green-400/30 text-green-300 hover:bg-green-500/30 transition-all duration-300 text-sm"
                                title="إرسال رسالة واتساب"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>واتساب</span>
                              </button>
                            </td>
                          )}
                          {matchType !== "group" && (() => {
                            const pair = (calculatedPairs || []).find((p: any) => {
                              const a = p.participant_a
                              const b = p.participant_b
                              const x = participant.assigned_number
                              const y = participant.partner_assigned_number
                              if (!y) return false
                              return (a === x && b === y) || (a === y && b === x)
                            })
                            const hasAny = pair && (pair.intent_boost_applied || pair.attachment_penalty_applied || pair.dead_air_veto_applied || pair.humor_clash_veto_applied || pair.cap_applied != null || (pair.humor_early_openness_bonus && pair.humor_early_openness_bonus !== 'none'))
                            return (
                              <td className="p-4 text-center">
                                {hasAny ? (
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
                                              <div className="text-red-300">• قيد الصمت: تم تقييد الدرجة إلى 40%</div>
                                            )}
                                            {pair?.humor_clash_veto_applied && (
                                              <div className="text-red-300">• تعارض الدعابة: تم تقييد الدرجة إلى 50%</div>
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
                                ) : (
                                  <span className="text-slate-500 text-xs">—</span>
                                )}
                              </td>
                            )
                          })()}
                          {matchType !== "group" && (() => {
                            // Always show new model values; derive from calculatedPairs when available
                            const pair = (calculatedPairs || []).find((p: any) => {
                              const a = p.participant_a
                              const b = p.participant_b
                              const x = participant.assigned_number
                              const y = participant.partner_assigned_number
                              if (!y) return false
                              return (a === x && b === y) || (a === y && b === x)
                            })
                            const synergy = pair?.synergy_score ?? 0
                            const life = pair?.lifestyle_compatibility_score ?? 0
                            const humorOpen = pair?.humor_open_score ?? 0
                            const comm = pair?.communication_compatibility_score ?? 0
                            const intent = pair?.intent_score ?? 0
                            const vibe = pair?.vibe_compatibility_score ?? 0
                            return (
                              <>
                                <td className="p-4 text-center"><span className="text-slate-300 text-sm">{Number(synergy).toFixed(1)}%</span></td>
                                <td className="p-4 text-center"><span className="text-slate-300 text-sm">{Number(life).toFixed(1)}%</span></td>
                                <td className="p-4 text-center"><span className="text-slate-300 text-sm">{Number(humorOpen).toFixed(1)}%</span></td>
                                <td className="p-4 text-center"><span className="text-slate-300 text-sm">{Number(comm).toFixed(1)}%</span></td>
                                <td className="p-4 text-center"><span className="text-slate-300 text-sm">{Number(intent).toFixed(1)}%</span></td>
                                {matchType === "ai" && (
                                  <td className="p-4 text-center"><span className="text-slate-300 text-sm">{Number(vibe).toFixed(1)}%</span></td>
                                )}
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
        <div className={`border-t p-4 ${cohostTheme ? 'border-rose-400/20 bg-rose-500/10' : 'border-white/20 bg-white/5'}`}>
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
      />
    </div>
  )
}
