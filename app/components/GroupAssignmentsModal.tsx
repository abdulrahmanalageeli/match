import { X, Users, MapPin, Star } from "lucide-react"

interface GroupAssignment {
  group_number: number
  table_number: number
  participants: Array<{
    number: number
    name: string
    age?: number
  }>
  compatibility_score: number
  participant_count: number
}

interface GroupAssignmentsModalProps {
  isOpen: boolean
  onClose: () => void
  groupAssignments: GroupAssignment[]
  totalGroups: number
  totalParticipants: number
}

export default function GroupAssignmentsModal({
  isOpen,
  onClose,
  groupAssignments,
  totalGroups,
  totalParticipants
}: GroupAssignmentsModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/20 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">توزيع المجموعات</h2>
              <p className="text-sm text-slate-400">
                {totalGroups} مجموعة • {totalParticipants} مشارك
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {groupAssignments.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-slate-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-300 mb-2">لا توجد مجموعات</h3>
              <p className="text-slate-500">لم يتم إنشاء أي مجموعات بعد. قم بتشغيل مطابقة المجموعات أولاً.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {groupAssignments.map((group) => (
                <div
                  key={group.group_number}
                  className="bg-white/5 backdrop-blur-sm border-2 border-white/20 rounded-xl overflow-hidden hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/20 transition-all duration-300"
                >
                  {/* PROMINENT TABLE NUMBER HEADER */}
                  <div className="bg-gradient-to-r from-cyan-500 to-blue-500 p-3 sm:p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      <span className="text-white/80 text-xs sm:text-sm font-medium">طاولة رقم</span>
                    </div>
                    <div className="text-4xl sm:text-5xl md:text-6xl font-black text-white drop-shadow-lg">
                      {group.table_number}
                    </div>
                  </div>

                  <div className="p-3 sm:p-5">
                    {/* Group Info */}
                    <div className="flex items-center justify-between mb-3 sm:mb-4 pb-2 sm:pb-3 border-b border-white/10">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                          <span className="text-white font-bold text-xs sm:text-sm">{group.group_number}</span>
                        </div>
                        <span className="text-white font-semibold text-sm sm:text-base">المجموعة {group.group_number}</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/20 border border-yellow-400/30">
                        <Star className="w-3 h-3 text-yellow-400" />
                        <span className="text-yellow-300 text-xs font-bold">{group.compatibility_score}%</span>
                      </div>
                    </div>

                    {/* Participants */}
                    <div className="space-y-2">
                      <div className="text-xs text-slate-400 font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" />
                        المشاركون ({group.participant_count}):
                      </div>
                      {group.participants.map((participant) => (
                        <div
                          key={participant.number}
                          className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-gradient-to-r from-white/10 to-white/5 border border-white/20 hover:border-cyan-400/40 transition-all"
                        >
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
                            <span className="text-white text-xs font-bold">#{participant.number}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-white text-xs sm:text-sm font-medium truncate">{participant.name}</span>
                              {participant.age && (
                                <span className="text-slate-400 text-xs shrink-0">({participant.age})</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Group Size Indicator */}
                    <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-white/10">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">حجم المجموعة:</span>
                        <span className={`font-bold px-2 py-1 rounded-full text-xs ${
                          group.participant_count === 4 ? 'text-green-400 bg-green-500/20' :
                          group.participant_count === 3 ? 'text-yellow-400 bg-yellow-500/20' :
                          group.participant_count === 5 ? 'text-orange-400 bg-orange-500/20' :
                          'text-red-400 bg-red-500/20'
                        }`}>
                          {group.participant_count} أشخاص
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {groupAssignments.length > 0 && (
          <div className="border-t border-white/10 p-3 sm:p-4 bg-white/5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 text-sm">
              <div className="text-slate-400 text-xs sm:text-sm">
                إجمالي: {totalGroups} مجموعة • {totalParticipants} مشارك
              </div>
              <div className="flex items-center gap-3 sm:gap-4 text-xs flex-wrap justify-center">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-400"></div>
                  <span className="text-slate-400 whitespace-nowrap">4 أشخاص (مثالي)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                  <span className="text-slate-400 whitespace-nowrap">3 أشخاص</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                  <span className="text-slate-400 whitespace-nowrap">5 أشخاص</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
