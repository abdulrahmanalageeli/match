import { useState, useEffect } from "react"
import { X, Users, Heart, Trophy, Star, Eye, ArrowUpDown, CheckCircle, XCircle, AlertTriangle, Zap, Brain, MessageCircle, Home, DollarSign, Info, ArrowLeftRight, Lock, Unlock, MessageSquare } from "lucide-react"
import ParticipantDetailModal from "./ParticipantDetailModal"

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
  partner_assigned_number?: number
  partner_name?: string
  is_organizer_match?: boolean
  incompatibility_reason?: string
  paid_done?: boolean
  partner_paid_done?: boolean
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
  onSelectParticipant?: (participantNumber: number) => void // NEW: For selecting participants
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
  onSelectParticipant
}: ParticipantResultsModalProps) {
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedParticipant, setSelectedParticipant] = useState<{assigned_number: number, name: string} | null>(null)
  const [participantMatches, setParticipantMatches] = useState<any[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [lockedMatches, setLockedMatches] = useState<any[]>([])
  const [loadingLock, setLoadingLock] = useState<number | null>(null)
  const [swappingParticipant, setSwappingParticipant] = useState<number | null>(null)

  // Fetch locked matches when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchLockedMatches()
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

  const handleSwapMatch = (participantNumber: number, participantName: string) => {
    setSwappingParticipant(participantNumber)
    fetchParticipantDetails(participantNumber, participantName)
  }

  const handleSwapConfirm = async (newPartnerNumber: number) => {
    if (!swappingParticipant) return
    
    try {
      // Create a new manual match with the selected partner
      const response = await fetch("/api/admin/trigger-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          eventId: currentEventId,
          manualMatch: {
            participant1: swappingParticipant,
            participant2: newPartnerNumber
          }
        })
      })
      
      const data = await response.json()
      if (response.ok) {
        // Prepare success message with cleanup information
        let successMessage = `✅ تم تبديل التوافق بنجاح! #${swappingParticipant} ↔ #${newPartnerNumber}\n\nالتوافق: ${data.compatibility_score}%`
        
        // Add cleanup summary if any conflicts were resolved
        if (data.cleanup_summary && data.cleanup_summary.length > 0) {
          successMessage += `\n\n🧹 تنظيف تلقائي:\n${data.cleanup_summary.join('\n')}`
        }
        
        successMessage += `\n\n🔄 سيتم تحديث النتائج تلقائياً...`
        
        alert(successMessage)
        setShowDetailModal(false)
        setSwappingParticipant(null)
        
        // Refresh the results to show the new match
        // This will reload from the database and show updated persistent session
        if (onRefresh) {
          await onRefresh()
        }
      } else {
        alert(`❌ فشل التبديل: ${data.error}`)
      }
    } catch (error) {
      console.error("Error swapping match:", error)
      alert("❌ حدث خطأ أثناء تبديل التوافق")
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
      const otherParticipant = results.find(r => r.assigned_number === otherParticipantNumber)
      
      return {
        participant_number: otherParticipantNumber,
        participant_name: otherParticipant?.name || `المشارك #${otherParticipantNumber}`,
        compatibility_score: pair.compatibility_score,
        mbti_compatibility_score: pair.mbti_compatibility_score,
        attachment_compatibility_score: pair.attachment_compatibility_score,
        communication_compatibility_score: pair.communication_compatibility_score,
        lifestyle_compatibility_score: pair.lifestyle_compatibility_score,
        core_values_compatibility_score: pair.core_values_compatibility_score,
        vibe_compatibility_score: pair.vibe_compatibility_score,
        is_actual_match: pair.is_actual_match
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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/20 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/20">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-2 rounded-xl">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                نتائج التوافق - {matchType === "ai" ? "مع الذكاء الاصطناعي" : matchType === "no-ai" ? "بدون ذكاء اصطناعي" : "مجموعات"}
              </h2>
              <p className="text-slate-400 text-sm">
                إجمالي التوافقات: {totalMatches} | المشاركين: {sortedResults.length}
                {matchType !== "group" && results.length !== sortedResults.length && (
                  <span className="text-yellow-400"> (تم إزالة {results.length - sortedResults.length} مكرر)</span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all duration-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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
                          <th className="text-center p-4 text-sm font-semibold text-slate-300">تبديل</th>
                        )}
                        {matchType !== "group" && (
                          <th className="text-center p-4 text-sm font-semibold text-slate-300">تثبيت التوافق</th>
                        )}
                        {matchType !== "group" && (
                          <th className="text-center p-4 text-sm font-semibold text-slate-300">عرض التفاصيل</th>
                        )}
                        {matchType !== "group" && onSelectParticipant && (
                          <th className="text-center p-4 text-sm font-semibold text-slate-300">اختيار للواتساب</th>
                        )}
                        {matchType !== "group" && (
                          <>
                            <th className="text-center p-4 text-sm font-semibold text-slate-300">
                              <div className="flex items-center justify-center gap-1">
                                <Brain className="w-3 h-3" />
                                <span className="text-xs">MBTI</span>
                              </div>
                            </th>
                            <th className="text-center p-4 text-sm font-semibold text-slate-300">
                              <div className="flex items-center justify-center gap-1">
                                <Heart className="w-3 h-3" />
                                <span className="text-xs">التعلق</span>
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
                                <Home className="w-3 h-3" />
                                <span className="text-xs">نمط الحياة</span>
                              </div>
                            </th>
                            <th className="text-center p-4 text-sm font-semibold text-slate-300">
                              <div className="flex items-center justify-center gap-1">
                                <Star className="w-3 h-3" />
                                <span className="text-xs">القيم</span>
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
                              <span className="text-white font-medium">
                                {participant.name || "غير محدد"}
                              </span>
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
                                        <div className="text-xs text-slate-400">{participant.partner_name}</div>
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
                            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${getScoreBg(participant.compatibility_score)}`}>
                              <span className={`font-bold ${getScoreColor(participant.compatibility_score)}`}>
                                {participant.compatibility_score}%
                              </span>
                            </div>
                          </td>
                          {matchType !== "group" && (
                            <td className="p-4 text-center">
                              {participant.partner_assigned_number && participant.partner_assigned_number !== 9999 ? (
                                <button
                                  onClick={() => handleSwapMatch(participant.assigned_number, participant.name)}
                                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-purple-500/20 border border-purple-400/30 text-purple-300 hover:bg-purple-500/30 transition-all duration-300 text-sm"
                                  title="تبديل الشريك"
                                >
                                  <ArrowLeftRight className="w-3 h-3" />
                                  <span>تبديل</span>
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
                                onClick={() => {
                                  setSwappingParticipant(null)
                                  fetchParticipantDetails(participant.assigned_number, participant.name)
                                }}
                                disabled={loadingDetails}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-500/20 border border-blue-400/30 text-blue-300 hover:bg-blue-500/30 transition-all duration-300 text-sm disabled:opacity-50"
                              >
                                <Eye className="w-3 h-3" />
                                <span>عرض</span>
                              </button>
                            </td>
                          )}
                          {matchType !== "group" && onSelectParticipant && (
                            <td className="p-4 text-center">
                              <button
                                onClick={() => {
                                  onSelectParticipant(participant.assigned_number)
                                  onClose() // Close the modal after selection
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-green-500/20 border border-green-400/30 text-green-300 hover:bg-green-500/30 transition-all duration-300 text-sm"
                                title="اختيار للواتساب"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>اختيار</span>
                              </button>
                            </td>
                          )}
                          {matchType !== "group" && (
                            <>
                              <td className="p-4 text-center">
                                <span className="text-slate-300 text-sm">
                                  {participant.mbti_compatibility_score?.toFixed(1) || "0"}%
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className="text-slate-300 text-sm">
                                  {participant.attachment_compatibility_score?.toFixed(1) || "0"}%
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className="text-slate-300 text-sm">
                                  {participant.communication_compatibility_score?.toFixed(1) || "0"}%
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className="text-slate-300 text-sm">
                                  {participant.lifestyle_compatibility_score?.toFixed(1) || "0"}%
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className="text-slate-300 text-sm">
                                  {participant.core_values_compatibility_score?.toFixed(1) || "0"}%
                                </span>
                              </td>
                              {matchType === "ai" && (
                                <td className="p-4 text-center">
                                  <span className="text-slate-300 text-sm">
                                    {participant.vibe_compatibility_score?.toFixed(1) || "0"}%
                                  </span>
                                </td>
                              )}
                            </>
                          )}
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
        <div className="border-t border-white/20 p-4 bg-white/5">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-400">
              تم إنشاء {totalMatches} مطابقة بنجاح
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-xl transition-all duration-300"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>

      {/* Participant Detail Modal */}
      <ParticipantDetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false)
          setSwappingParticipant(null)
        }}
        participant={selectedParticipant}
        matches={participantMatches}
        matchType={matchType}
        swapMode={swappingParticipant !== null}
        onSwapSelect={handleSwapConfirm}
      />
    </div>
  )
}
