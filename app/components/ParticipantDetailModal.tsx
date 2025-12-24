import React, { useState, useEffect, useMemo } from "react"
import { X, User, Users, Heart, Brain, MessageCircle, Home, Star, Zap, ArrowLeft, ArrowLeftRight, RotateCcw, Sparkles, Lock, TrendingUp, TrendingDown } from "lucide-react"
import * as Tooltip from "@radix-ui/react-tooltip"

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
  lockedMatches?: Array<{ participant1_number: number; participant2_number: number; original_compatibility_score?: number }>
}

export default function ParticipantDetailModal({ 
  isOpen, 
  onClose, 
  participant, 
  matches, 
  matchType,
  swapMode = false,
  onSwapSelect,
  lockedMatches = []
}: ParticipantDetailModalProps) {
  const [participantData, setParticipantData] = useState<Map<number, any>>(new Map())

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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/20 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/20">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-xl">
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
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all duration-300"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">العودة</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all duration-300"
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
                        {matchType !== "group" && (() => {
                          const hasNew = sortedMatches.some(m => m.synergy_score !== undefined || m.humor_open_score !== undefined || m.intent_score !== undefined)
                          if (hasNew) {
                            return (
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
                            )
                          }
                          return (
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
                          )
                        })()}
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
                          }`}
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
                              <Tooltip.Provider delayDuration={300}>
                                <Tooltip.Root>
                                  <Tooltip.Trigger asChild>
                                    <span className="text-white font-medium cursor-help hover:text-cyan-300 transition-colors">
                                      {match.participant_name || "غير محدد"}
                                    </span>
                                  </Tooltip.Trigger>
                                  <Tooltip.Portal>
                                    <Tooltip.Content
                                      className="z-[100] max-w-4xl p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-cyan-400/30 rounded-xl shadow-2xl"
                                      sideOffset={5}
                                    >
                                      {(() => {
                                        const pData = participantData.get(match.participant_number)
                                        const surveyData = pData?.survey_data || {}
                                        const answers = surveyData.answers || {}
                                        
                                        return (
                                          <div className="space-y-2">
                                            {/* Header */}
                                            <div className="border-b border-cyan-400/20 pb-2 flex items-center justify-between" dir="rtl">
                                              <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-cyan-300 font-bold text-lg">{match.participant_name || "غير محدد"}</span>
                                                  <span className="text-slate-400 text-sm">#{match.participant_number}</span>
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
                                                    <span className="text-slate-400">الموسيقى:</span>
                                                    <span className="text-white ml-1">{answers.vibe_3}</span>
                                                  </div>
                                                )}
                                                
                                                {answers.vibe_4 && (
                                                  <div className="text-xs">
                                                    <span className="text-slate-400">عمق المحادثة:</span>
                                                    <span className="text-white ml-1">{answers.vibe_4}</span>
                                                  </div>
                                                )}
                                              </div>
                                              
                                              {/* Right Column - Quick Stats */}
                                              <div className="space-y-1.5">
                                                <div className="text-cyan-300 font-semibold text-xs mb-1">التوافق:</div>
                                                <div className="text-xs">
                                                  <span className="text-slate-400">إجمالي:</span>
                                                  <span className="text-green-400 ml-1 font-bold">{match.compatibility_score}%</span>
                                                </div>
                                                {match.mbti_compatibility_score && (
                                                  <div className="text-xs">
                                                    <span className="text-slate-400">MBTI:</span>
                                                    <span className="text-white ml-1">{match.mbti_compatibility_score.toFixed(1)}%</span>
                                                  </div>
                                                )}
                                                {match.vibe_compatibility_score && (
                                                  <div className="text-xs">
                                                    <span className="text-slate-400">الطاقة:</span>
                                                    <span className="text-white ml-1">{match.vibe_compatibility_score.toFixed(1)}%</span>
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      })()}
                                      <Tooltip.Arrow className="fill-cyan-400/30" />
                                    </Tooltip.Content>
                                  </Tooltip.Portal>
                                </Tooltip.Root>
                              </Tooltip.Provider>
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
                          {matchType !== "group" && (() => {
                            const hasNew = match.synergy_score !== undefined || match.humor_open_score !== undefined || match.intent_score !== undefined
                            if (hasNew) {
                              return (
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
                              )
                            }
                            return (
                              <>
                                <td className="p-4 text-center">
                                  <span className="text-slate-300 text-sm">
                                    {match.mbti_compatibility_score?.toFixed(1) || "0"}%
                                  </span>
                                </td>
                                <td className="p-4 text-center">
                                  <span className="text-slate-300 text-sm">
                                    {match.attachment_compatibility_score?.toFixed(1) || "0"}%
                                  </span>
                                </td>
                                <td className="p-4 text-center">
                                  <span className="text-slate-300 text-sm">
                                    {match.communication_compatibility_score?.toFixed(1) || "0"}%
                                  </span>
                                </td>
                                <td className="p-4 text-center">
                                  <span className="text-slate-300 text-sm">
                                    {match.lifestyle_compatibility_score?.toFixed(1) || "0"}%
                                  </span>
                                </td>
                                <td className="p-4 text-center">
                                  <span className="text-slate-300 text-sm">
                                    {match.core_values_compatibility_score?.toFixed(1) || "0"}%
                                  </span>
                                </td>
                                {matchType === "ai" && (
                                  <td className="p-4 text-center">
                                    <span className="text-slate-300 text-sm">
                                      {match.vibe_compatibility_score?.toFixed(1) || "0"}%
                                    </span>
                                  </td>
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
