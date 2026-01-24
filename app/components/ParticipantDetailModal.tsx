import React, { useState, useEffect, useMemo } from "react"
import { X, User, Users, Heart, Brain, MessageCircle, Home, Star, Zap, ArrowLeft, ArrowLeftRight, RotateCcw, Sparkles, Lock, TrendingUp, TrendingDown, Info, AlertTriangle } from "lucide-react"
import * as Tooltip from "@radix-ui/react-tooltip"
import * as Popover from "@radix-ui/react-popover"
import ParticipantHoverCardContent from "./ParticipantHoverCard"

interface ParticipantMatch {
  participant_number: number
  participant_name: string
  compatibility_score: number
  mbti_compatibility_score?: number
  attachment_compatibility_score?: number
  communication_compatibility_score?: number
  lifestyle_compatibility_score?: number
  core_values_compatibility_score?: number
  vibe_compatibility_score?: number
  is_actual_match: boolean
  is_repeated_match?: boolean
  humor_early_openness_bonus?: 'full' | 'partial' | 'none'
  // New model fields (optional)
  synergy_score?: number
  humor_open_score?: number
  intent_score?: number
  intent_self?: string
  intent_other?: string
  // Gates & bonuses flags (optional)
  attachment_penalty_applied?: boolean
  intent_boost_applied?: boolean
  dead_air_veto_applied?: boolean
  humor_clash_veto_applied?: boolean
  cap_applied?: number | null
  reason?: string
  openness_zero_zero_penalty_applied?: boolean
}

interface ParticipantDetailModalProps {
  isOpen: boolean
  onClose: () => void
  participant: {
    assigned_number: number
    name: string
  } | null
  matches: ParticipantMatch[]
  matchType: "ai" | "no-ai" | "group"
  swapMode?: boolean
  onSwapSelect?: (newPartnerNumber: number) => Promise<void>
  lockedMatches?: Array<{ id?: string; participant1_number: number; participant2_number: number; original_compatibility_score?: number }>
  cohostTheme?: boolean
}

export default function ParticipantDetailModal({ 
  isOpen, 
  onClose, 
  participant, 
  matches, 
  matchType,
  swapMode = false,
  onSwapSelect,
  lockedMatches = [],
  cohostTheme = false
}: ParticipantDetailModalProps) {
  const [participantData, setParticipantData] = useState<Map<number, any>>(new Map())
  // Loading indicator for creating a manual match for a specific partner number
  const [creatingManualFor, setCreatingManualFor] = useState<number | null>(null)

  // Build quick lookup for locked partners and their locked scores
  const lockedByParticipant = useMemo(() => {
    const map = new Map<number, { with: number; score: number }>()
    for (const lock of lockedMatches) {
      const score = typeof lock.original_compatibility_score === 'number' ? Math.round(lock.original_compatibility_score) : 0
      map.set(lock.participant1_number, { with: lock.participant2_number, score })
      map.set(lock.participant2_number, { with: lock.participant1_number, score })
    }
    return map
  }, [lockedMatches])

  // Fetch participant data for all potential matches
  useEffect(() => {
    const fetchParticipantData = async () => {
      if (!isOpen || matches.length === 0) return
      
      try {
        // Get unique participant numbers from matches
        const participantNumbers = new Set<number>()
        matches.forEach(m => {
          participantNumbers.add(m.participant_number)
        })
        // Include selected participant to compute pair openness flags
        if (participant?.assigned_number) {
          participantNumbers.add(participant.assigned_number)
        }

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

    fetchParticipantData()
  }, [isOpen, matches])

  // Create a manual match using the same API used in admin.tsx (trigger-match with manualMatch)
  const createManualMatch = async (partnerNumber: number) => {
    if (!participant?.assigned_number || !partnerNumber) return
    const p1 = participant.assigned_number
    const p2 = partnerNumber
    const confirmMessage = `سيتم إنشاء مطابقة فعلية بين:\n\n#${p1} ↔ #${p2}\n\nهل أنت متأكد؟`
    if (!confirm(confirmMessage)) return
    setCreatingManualFor(p2)
    try {
      // Fetch current event id (fallback to 1)
      let currentEventId = 1
      try {
        const eidRes = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get-current-event-id" })
        })
        if (eidRes.ok) {
          const eid = await eidRes.json()
          currentEventId = eid.current_event_id || 1
        }
      } catch (_) {}

      // 1) Unlock any existing locks that involve either participant (p1 or p2)
      try {
        const locksToRemove = (lockedMatches || []).filter(l => 
          (l.participant1_number === p1 || l.participant2_number === p1 || l.participant1_number === p2 || l.participant2_number === p2)
        )
        for (const lock of locksToRemove) {
          if (!lock?.id) continue
          await fetch("/api/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "remove-locked-match", id: lock.id })
          })
        }
      } catch (e) {
        console.error("Error unlocking previous locks:", e)
      }

      const res = await fetch("/api/admin/trigger-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: currentEventId,
          manualMatch: {
            participant1: p1,
            participant2: p2,
            bypassEligibility: false,
            testModeOnly: false
          }
        })
      })
      const data = await res.json()
      if (res.ok) {
        // 2) Auto-lock the newly created match
        try {
          const score = (matches.find(m => m.participant_number === p2)?.compatibility_score) ?? 0
          await fetch("/api/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "add-locked-match",
              participant1: p1,
              participant2: p2,
              compatibilityScore: Math.round(score),
              round: 1,
              reason: "Auto-locked after manual match creation"
            })
          })
        } catch (e) {
          console.error("Error auto-locking new match:", e)
        }
        alert(`✅ تم إنشاء المطابقة وتثبيتها بنجاح:\n#${p1} ↔ #${p2}`)
        // Close details modal; parent can refresh if needed
        onClose()
      } else {
        alert(`❌ فشل إنشاء المطابقة:\n${data?.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error creating manual match:", error)
      alert("❌ حدث خطأ أثناء إنشاء المطابقة")
    } finally {
      setCreatingManualFor(null)
    }
  }

  if (!isOpen || !participant) return null

  // Sort matches by compatibility score (descending)
  const sortedMatches = [...matches].sort((a, b) => b.compatibility_score - a.compatibility_score)

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
    <div className={`fixed inset-0 ${cohostTheme ? 'bg-rose-900/40' : 'bg-black/50'} backdrop-blur-sm z-50 flex items-center justify-center p-4`}>
      <div className={`${cohostTheme ? 'bg-gradient-to-br from-rose-950 via-slate-900 to-rose-950 border-4 border-rose-400/30 rounded-3xl' : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/20 rounded-2xl'} shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${cohostTheme ? 'border-rose-400/20' : 'border-white/20'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${cohostTheme ? 'bg-gradient-to-r from-rose-500 to-pink-600' : 'bg-gradient-to-r from-blue-600 to-purple-600'}`}>
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {swapMode ? "اختر شريكاً جديداً" : "تفاصيل المطابقات"} - المشارك #{participant.assigned_number}
              </h2>
              <p className="text-slate-400 text-sm">
                {participant.name} | {swapMode ? "اختر من المطابقات المحتملة" : `إجمالي المطابقات المحتملة: ${matches.length}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-white transition-all duration-300 ${cohostTheme ? 'bg-rose-500/20 hover:bg-rose-500/30' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">العودة</span>
            </button>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl text-white transition-all duration-300 ${cohostTheme ? 'bg-rose-500/20 hover:bg-rose-500/30' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {matches.length === 0 ? (
            <div className="text-center py-12">
              <User className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">لا توجد مطابقات</h3>
              <p className="text-slate-400">لم يتم العثور على مطابقات محتملة لهذا المشارك</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-slate-300">إجمالي المطابقات</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{matches.length}</div>
                </div>
                
                <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Heart className="w-4 h-4 text-pink-400" />
                    <span className="text-sm text-slate-300">متوسط التوافق</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {Math.round(matches.reduce((sum, m) => sum + m.compatibility_score, 0) / matches.length)}%
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm text-slate-300">أعلى توافق</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {Math.max(...matches.map(m => m.compatibility_score))}%
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <RotateCcw className="w-4 h-4 text-orange-400" />
                    <span className="text-sm text-slate-300">مطابقات سابقة</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {matches.filter(m => m.is_repeated_match).length}
                  </div>
                </div>
              </div>

              {/* Matches Table */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-white/10">
                      <tr>
                        <th className="text-right p-4 text-sm font-semibold text-slate-300">المشارك</th>
                        <th className="text-right p-4 text-sm font-semibold text-slate-300">الاسم</th>
                        <th className="text-center p-4 text-sm font-semibold text-slate-300">الحالة</th>
                        <th className="text-center p-4 text-sm font-semibold text-slate-300">التوافق الإجمالي</th>
                        {swapMode && (
                          <th className="text-center p-4 text-sm font-semibold text-slate-300">اختيار</th>
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
                      {sortedMatches.map((match, index) => (
                        <tr 
                          key={match.participant_number} 
                          className={`border-t border-white/10 hover:bg-white/5 transition-colors ${
                            match.is_actual_match ? 'bg-gradient-to-r from-green-500/10 to-transparent' : ''
                          } ${
                            index < 3 && !match.is_actual_match ? 'bg-gradient-to-r from-blue-500/5 to-transparent' : ''
                          } ${(() => {
                            // Yellow only when the B-intent person is the one who accepts different goals.
                            const isSelfB = match.intent_self === 'B'
                            const isOtherB = match.intent_other === 'B'
                            if (!(isSelfB || isOtherB)) return ''
                            if (isSelfB && match.intent_other && match.intent_other !== 'B') {
                              const pA = participantData.get(participant.assigned_number)
                              const ansA = pA?.survey_data?.answers || {}
                              const openA = (pA?.open_intent_goal_mismatch === true) || (ansA.open_intent_goal_mismatch === true) || (ansA.open_intent_goal_mismatch === 'true')
                              return openA ? 'bg-yellow-500/10 border-yellow-400/20' : 'bg-red-500/10 border-red-400/20'
                            }
                            if (isOtherB && match.intent_self && match.intent_self !== 'B') {
                              const pB = participantData.get(match.participant_number)
                              const ansB = pB?.survey_data?.answers || {}
                              const openB = (pB?.open_intent_goal_mismatch === true) || (ansB.open_intent_goal_mismatch === true) || (ansB.open_intent_goal_mismatch === 'true')
                              return openB ? 'bg-yellow-500/10 border-yellow-400/20' : 'bg-red-500/10 border-red-400/20'
                            }
                            return ''
                          })()}`}
                        >
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              {match.is_actual_match && (
                                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-xs font-bold text-black">
                                  ✓
                                </div>
                              )}
                              {!match.is_actual_match && index < 3 && (
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  index === 0 ? 'bg-yellow-500 text-black' :
                                  index === 1 ? 'bg-gray-400 text-black' :
                                  'bg-orange-600 text-white'
                                }`}>
                                  {index + 1}
                                </div>
                              )}
                              <span className="font-mono text-white font-semibold">
                                #{match.participant_number}
                              </span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <Popover.Root>
                                <Tooltip.Provider delayDuration={300}>
                                  <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                      <Popover.Trigger asChild>
                                        <span className="text-white font-medium cursor-help hover:text-cyan-300 transition-colors">
                                          {match.participant_name || "غير محدد"}
                                        </span>
                                      </Popover.Trigger>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                      <Tooltip.Content
                                        className="z-[100] max-w-4xl p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-cyan-400/30 rounded-xl shadow-2xl"
                                        sideOffset={5}
                                      >
                                        <ParticipantHoverCardContent
                                          participantNumber={match.participant_number}
                                          participantName={match.participant_name || "غير محدد"}
                                          pData={participantData.get(match.participant_number)}
                                        />
                                        <Tooltip.Arrow className="fill-cyan-400/30" />
                                      </Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                </Tooltip.Provider>
                                <Popover.Portal>
                                  <Popover.Content
                                    className="z-[110] max-w-4xl p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-cyan-400/30 rounded-xl shadow-2xl relative"
                                    sideOffset={6}
                                  >
                                    <Popover.Close
                                      className="absolute top-2 left-2 p-1 rounded-md bg-white/10 hover:bg-white/20"
                                      aria-label="Close"
                                    >
                                      <span className="inline-flex">
                                        <X className="w-4 h-4 text-slate-200" />
                                      </span>
                                    </Popover.Close>
                                    <ParticipantHoverCardContent
                                      participantNumber={match.participant_number}
                                      participantName={match.participant_name || "غير محدد"}
                                      pData={participantData.get(match.participant_number)}
                                    />
                                  </Popover.Content>
                                </Popover.Portal>
                              </Popover.Root>
                              {(() => {
                                // Show openness 0×0 penalty icon next to potential partner name
                                const pA = participantData.get(participant.assigned_number)
                                const pB = participantData.get(match.participant_number)
                                const ansA = pA?.survey_data?.answers || {}
                                const ansB = pB?.survey_data?.answers || {}
                                const oaRaw = (pA?.early_openness_comfort ?? ansA.early_openness_comfort)
                                const obRaw = (pB?.early_openness_comfort ?? ansB.early_openness_comfort)
                                const oa = oaRaw !== undefined && oaRaw !== null ? parseInt(oaRaw) : undefined
                                const ob = obRaw !== undefined && obRaw !== null ? parseInt(obRaw) : undefined
                                if (oa === 0 && ob === 0) {
                                  return (
                                    <Tooltip.Provider delayDuration={150}>
                                      <Tooltip.Root>
                                        <Tooltip.Trigger asChild>
                                          <div className="w-5 h-5 rounded-full bg-yellow-500/20 border border-yellow-400/30 flex items-center justify-center" title="عقوبة الانفتاح 0×0 −5">
                                            <AlertTriangle className="w-3 h-3 text-yellow-300" />
                                          </div>
                                        </Tooltip.Trigger>
                                        <Tooltip.Portal>
                                          <Tooltip.Content sideOffset={6} className="z-[101] px-2 py-1 text-xs text-white bg-slate-900 border border-slate-700 rounded">
                                            عقوبة الانفتاح 0×0 −5
                                            <Tooltip.Arrow className="fill-slate-900" />
                                          </Tooltip.Content>
                                        </Tooltip.Portal>
                                      </Tooltip.Root>
                                    </Tooltip.Provider>
                                  )
                                }
                                return null
                              })()}
                              {(() => {
                                const locked = lockedByParticipant.get(match.participant_number)
                                if (!locked) return null
                                const isLockedWithSelected = participant && locked.with === participant.assigned_number
                                return (
                                  <Tooltip.Provider delayDuration={200}>
                                    <Tooltip.Root>
                                      <Tooltip.Trigger asChild>
                                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${isLockedWithSelected ? 'bg-green-500/20 border-green-400/30 text-green-300' : 'bg-amber-500/20 border-amber-400/30 text-amber-300'}`}>
                                          <Lock className="w-3 h-3" />
                                          <span>{isLockedWithSelected ? 'مقفل مع المختار' : `مقفل مع #${locked.with}`}</span>
                                        </div>
                                      </Tooltip.Trigger>
                                      <Tooltip.Portal>
                                        <Tooltip.Content sideOffset={5} className="z-[101] px-3 py-2 text-sm text-white bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
                                          التثبيت الحالي: #{locked.with} • {locked.score}%
                                          <Tooltip.Arrow className="fill-slate-800" />
                                        </Tooltip.Content>
                                      </Tooltip.Portal>
                                    </Tooltip.Root>
                                  </Tooltip.Provider>
                                )
                              })()}
                              {match.is_repeated_match && (
                                <div 
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-400/30 text-orange-300 text-xs"
                                  title="تم المطابقة معه سابقاً في حدث سابق - غير مؤهل للمطابقة مرة أخرى"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>سابق</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            {match.is_actual_match ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 border border-green-400/30 text-green-300 text-xs">
                                <Heart className="w-3 h-3" />
                                مطابقة فعلية
                              </span>
                            ) : match.is_repeated_match ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/20 border border-orange-400/30 text-orange-300 text-xs">
                                <RotateCcw className="w-3 h-3" />
                                مطابقة متكررة
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs">
                                <User className="w-3 h-3" />
                                محتملة
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${getScoreBg(match.compatibility_score)}`}>
                              <span className={`font-bold ${getScoreColor(match.compatibility_score)}`}>
                                {match.compatibility_score}%
                              </span>
                              {(() => {
                                const locked = lockedByParticipant.get(match.participant_number)
                                if (!locked) return null
                                const delta = match.compatibility_score - locked.score
                                if (delta > 0) {
                                  return (
                                    <Tooltip.Provider delayDuration={150}>
                                      <Tooltip.Root>
                                        <Tooltip.Trigger asChild>
                                          <span className="inline-flex items-center gap-1 text-green-300 text-xs">
                                            <TrendingUp className="w-4 h-4" />
                                            +{delta}%
                                          </span>
                                        </Tooltip.Trigger>
                                        <Tooltip.Portal>
                                          <Tooltip.Content sideOffset={5} className="z-[101] px-3 py-2 text-sm text-white bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
                                            أعلى من التثبيت الحالي ({locked.score}%) بمقدار {delta}%
                                            <Tooltip.Arrow className="fill-slate-800" />
                                          </Tooltip.Content>
                                        </Tooltip.Portal>
                                      </Tooltip.Root>
                                    </Tooltip.Provider>
                                  )
                                } else if (delta < 0) {
                                  return (
                                    <Tooltip.Provider delayDuration={150}>
                                      <Tooltip.Root>
                                        <Tooltip.Trigger asChild>
                                          <span className="inline-flex items-center gap-1 text-red-300 text-xs">
                                            <TrendingDown className="w-4 h-4" />
                                            {delta}%
                                          </span>
                                        </Tooltip.Trigger>
                                        <Tooltip.Portal>
                                          <Tooltip.Content sideOffset={5} className="z-[101] px-3 py-2 text-sm text-white bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
                                            أقل من التثبيت الحالي ({locked.score}%) بمقدار {Math.abs(delta)}%
                                            <Tooltip.Arrow className="fill-slate-800" />
                                          </Tooltip.Content>
                                        </Tooltip.Portal>
                                      </Tooltip.Root>
                                    </Tooltip.Provider>
                                  )
                                } else {
                                  return (
                                    <span className="text-amber-300 text-xs">مطابق للتثبيت الحالي</span>
                                  )
                                }
                              })()}
                              {match.humor_early_openness_bonus && match.humor_early_openness_bonus !== 'none' && (
                                <Tooltip.Provider delayDuration={200}>
                                  <Tooltip.Root>
                                    <Tooltip.Trigger>
                                      <Sparkles className={`w-4 h-4 ${match.humor_early_openness_bonus === 'full' ? 'text-yellow-400' : 'text-yellow-600'}`} />
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                      <Tooltip.Content sideOffset={5} className="z-[101] px-3 py-2 text-sm text-white bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
                                        {match.humor_early_openness_bonus === 'full' ? 'Full Humor/Openness Bonus' : 'Partial Bonus'}
                                        <Tooltip.Arrow className="fill-slate-800" />
                                      </Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                </Tooltip.Provider>
                              )}
                            </div>
                          </td>
                          {swapMode && (
                            <td className="p-4 text-center">
                              <button
                                onClick={() => onSwapSelect?.(match.participant_number)}
                                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white transition-all duration-300 text-sm font-semibold"
                              >
                                <ArrowLeftRight className="w-4 h-4" />
                                <span>اختر هذا الشريك</span>
                              </button>
                            </td>
                          )}
                          {matchType !== "group" && (
                            <td className="p-4 text-center">
                              {(() => {
                                const hasAny = (
                                  !!match.intent_boost_applied ||
                                  !!match.attachment_penalty_applied ||
                                  !!match.dead_air_veto_applied ||
                                  !!match.humor_clash_veto_applied ||
                                  match.cap_applied != null ||
                                  (match.humor_early_openness_bonus && match.humor_early_openness_bonus !== 'none')
                                )
                                const tolerated = !!(match && typeof match.reason === 'string' && match.reason.includes('±1y'))
                                return (
                                  <div className="inline-flex items-center gap-2 justify-center">
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
                                                  if (match.intent_self === 'B' && match.intent_other && match.intent_other !== 'B') {
                                                    return (
                                                      <div className="text-red-300">• اختلاف الهدف: B × {match.intent_other}</div>
                                                    )
                                                  }
                                                  if (match.intent_other === 'B' && match.intent_self && match.intent_self !== 'B') {
                                                    return (
                                                      <div className="text-red-300">• اختلاف الهدف: {match.intent_self} × B</div>
                                                    )
                                                  }
                                                  return null
                                                })()}
                                                {/* Show both goals */}
                                                <div className="text-slate-300">• هدف (المشارك): {match.intent_self || 'غير محدد'}</div>
                                                <div className="text-slate-300">• هدف (الشريك): {match.intent_other || 'غير محدد'}</div>
                                                {(() => {
                                                  // Show each person's openness to different goals
                                                  const pA = participantData.get(participant.assigned_number)
                                                  const pB = participantData.get(match.participant_number)
                                                  const ansA = pA?.survey_data?.answers || {}
                                                  const ansB = pB?.survey_data?.answers || {}
                                                  const openA = (pA?.open_intent_goal_mismatch === true) || (ansA.open_intent_goal_mismatch === true) || (ansA.open_intent_goal_mismatch === 'true')
                                                  const openB = (pB?.open_intent_goal_mismatch === true) || (ansB.open_intent_goal_mismatch === true) || (ansB.open_intent_goal_mismatch === 'true')
                                                  return (
                                                    <>
                                                      <div className="text-slate-300">• قبول اختلاف الهدف (المشارك): {openA ? 'نعم' : 'لا'}</div>
                                                      <div className="text-slate-300">• قبول اختلاف الهدف (الشريك): {openB ? 'نعم' : 'لا'}</div>
                                                    </>
                                                  )
                                                })()}
                                                {match.humor_early_openness_bonus && match.humor_early_openness_bonus !== 'none' && (
                                                  <div className="text-amber-300">• مكافأة الدعابة/الانفتاح: {match.humor_early_openness_bonus === 'full' ? 'كاملة (×1.15)' : 'جزئية (×1.05)'}
                                                  </div>
                                                )}
                                                {match.intent_boost_applied && (
                                                  <div className="text-emerald-300">• مضاعف الهدف (×1.1) مطبق</div>
                                                )}
                                                {match.attachment_penalty_applied && (
                                                  <div className="text-red-300">• عقوبة تعلق (قلق × تجنُّب) −5</div>
                                                )}
                                                {match.dead_air_veto_applied && (
                                                  <div className="text-red-300">• قيد الصمت: تم تقييد الدرجة إلى 40%</div>
                                                )}
                                                {(() => {
                                                  const pA = participantData.get(participant.assigned_number)
                                                  const pB = participantData.get(match.participant_number)
                                                  const ansA = pA?.survey_data?.answers || {}
                                                  const ansB = pB?.survey_data?.answers || {}
                                                  const oaRaw = (pA?.early_openness_comfort ?? ansA.early_openness_comfort)
                                                  const obRaw = (pB?.early_openness_comfort ?? ansB.early_openness_comfort)
                                                  const oa = oaRaw !== undefined && oaRaw !== null ? parseInt(oaRaw) : undefined
                                                  const ob = obRaw !== undefined && obRaw !== null ? parseInt(obRaw) : undefined
                                                  if (oa === 0 && ob === 0) {
                                                    return (
                                                      <div className="text-yellow-300">• عقوبة الانفتاح 0×0 −5</div>
                                                    )
                                                  }
                                                  return null
                                                })()}
                                                {tolerated && (
                                                  <div className="text-yellow-300">• تسامح العمر: خارج النطاق ضمن ±1 سنة</div>
                                                )}
                                                {match.humor_clash_veto_applied && (
                                                  <div className="text-red-300">• تعارض الدعابة: تم تقييد الدرجة إلى 50%</div>
                                                )}
                                                {match.cap_applied != null && (
                                                  <div className="text-yellow-300">• تقييد نهائي: {match.cap_applied}%</div>
                                                )}
                                                {match.reason && (
                                                  <div className="text-slate-300 border-t border-slate-700 pt-1 mt-1">{match.reason}</div>
                                                )}
                                              </div>
                                              <Tooltip.Arrow className="fill-slate-900" />
                                            </Tooltip.Content>
                                          </Tooltip.Portal>
                                        </Tooltip.Root>
                                      </Tooltip.Provider>
                                    )}
                                    {tolerated && (
                                      <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-yellow-500/20 border border-yellow-400/30" title="تم قبول خارج تفضيل العمر ضمن تسامح ±1 سنة">
                                        <span className="text-yellow-300 text-[11px] font-bold">±1</span>
                                      </div>
                                    )}
                                    {!hasAny && !tolerated && (
                                      <span className="text-slate-500 text-xs">—</span>
                                    )}
                                    {/* Manual match creation button */}
                                    <button
                                      onClick={() => createManualMatch(match.participant_number)}
                                      disabled={creatingManualFor === match.participant_number}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-linear-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                                      title="إنشاء مطابقة فعلية لهذا الزوج"
                                    >
                                      <Heart className="w-3.5 h-3.5" />
                                      {creatingManualFor === match.participant_number ? '...جارٍ' : 'إنشاء مطابقة'}
                                    </button>
                                  </div>
                                )
                              })()}
                            </td>
                          )}
                          {matchType !== "group" && (
                            <>
                              <td className="p-4 text-center"><span className="text-slate-300 text-sm">{(match.synergy_score ?? 0).toFixed(1)}%</span></td>
                              <td className="p-4 text-center"><span className="text-slate-300 text-sm">{(match.lifestyle_compatibility_score ?? 0).toFixed(1)}%</span></td>
                              <td className="p-4 text-center"><span className="text-slate-300 text-sm">{(match.humor_open_score ?? 0).toFixed(1)}%</span></td>
                              <td className="p-4 text-center"><span className="text-slate-300 text-sm">{(match.communication_compatibility_score ?? 0).toFixed(1)}%</span></td>
                              <td className="p-4 text-center"><span className="text-slate-300 text-sm">{(match.intent_score ?? 0).toFixed(1)}%</span></td>
                              {matchType === "ai" && (
                                <td className="p-4 text-center"><span className="text-slate-300 text-sm">{(match.vibe_compatibility_score ?? 0).toFixed(1)}%</span></td>
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
              عرض جميع المطابقات المحتملة للمشارك #{participant.assigned_number}
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
    </div>
  )
}
