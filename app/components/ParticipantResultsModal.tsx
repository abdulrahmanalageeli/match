import React from "react"
import { X, Users, Heart, Brain, MessageCircle, Home, Star, Zap } from "lucide-react"

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
}

interface ParticipantResultsModalProps {
  isOpen: boolean
  onClose: () => void
  results: ParticipantResult[]
  matchType: "ai" | "no-ai" | "group"
  totalMatches: number
}

export default function ParticipantResultsModal({ 
  isOpen, 
  onClose, 
  results, 
  matchType, 
  totalMatches 
}: ParticipantResultsModalProps) {
  if (!isOpen) return null

  // Sort results by compatibility score (descending)
  const sortedResults = [...results].sort((a, b) => b.compatibility_score - a.compatibility_score)

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
                نتائج المطابقة - {matchType === "ai" ? "مع الذكاء الاصطناعي" : matchType === "no-ai" ? "بدون ذكاء اصطناعي" : "مجموعات"}
              </h2>
              <p className="text-slate-400 text-sm">
                إجمالي المطابقات: {totalMatches} | المشاركين: {results.length}
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
                  <div className="text-2xl font-bold text-white">{results.length}</div>
                </div>
                
                <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Heart className="w-4 h-4 text-pink-400" />
                    <span className="text-sm text-slate-300">متوسط التوافق</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {Math.round(results.reduce((sum, r) => sum + r.compatibility_score, 0) / results.length)}%
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm text-slate-300">أعلى توافق</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {Math.max(...results.map(r => r.compatibility_score))}%
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
                            index < 3 ? 'bg-gradient-to-r from-yellow-500/10 to-transparent' : ''
                          }`}
                        >
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              {index < 3 && (
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  index === 0 ? 'bg-yellow-500 text-black' :
                                  index === 1 ? 'bg-gray-400 text-black' :
                                  'bg-orange-600 text-white'
                                }`}>
                                  {index + 1}
                                </div>
                              )}
                              <span className="font-mono text-white font-semibold">
                                #{participant.assigned_number}
                              </span>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className="text-white font-medium">
                              {participant.name || "غير محدد"}
                            </span>
                          </td>
                          <td className="p-4">
                            {participant.partner_assigned_number ? (
                              <div className="text-slate-300">
                                <div className="font-mono">#{participant.partner_assigned_number}</div>
                                {participant.partner_name && (
                                  <div className="text-xs text-slate-400">{participant.partner_name}</div>
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
    </div>
  )
}
