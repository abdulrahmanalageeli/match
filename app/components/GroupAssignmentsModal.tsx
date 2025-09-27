import { X, Users, MapPin, Star } from "lucide-react"

interface GroupAssignment {
  group_number: number
  table_number: number
  participants: Array<{
    number: number
    name: string
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
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {groupAssignments.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-slate-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-300 mb-2">لا توجد مجموعات</h3>
              <p className="text-slate-500">لم يتم إنشاء أي مجموعات بعد. قم بتشغيل مطابقة المجموعات أولاً.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupAssignments.map((group) => (
                <div
                  key={group.group_number}
                  className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-xl p-6 hover:bg-white/10 transition-all duration-300"
                >
                  {/* Group Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{group.group_number}</span>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold">المجموعة {group.group_number}</h3>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <MapPin className="w-3 h-3" />
                          <span>طاولة {group.table_number}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/20 border border-yellow-400/30">
                      <Star className="w-3 h-3 text-yellow-400" />
                      <span className="text-yellow-300 text-xs font-medium">{group.compatibility_score}%</span>
                    </div>
                  </div>

                  {/* Participants */}
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400 mb-2">
                      المشاركون ({group.participant_count}):
                    </div>
                    {group.participants.map((participant) => (
                      <div
                        key={participant.number}
                        className="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/10"
                      >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
                          <span className="text-white text-xs font-medium">#{participant.number}</span>
                        </div>
                        <span className="text-white text-sm font-medium flex-1">{participant.name}</span>
                      </div>
                    ))}
                  </div>

                  {/* Group Size Indicator */}
                  <div className="mt-4 pt-3 border-t border-white/10">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">حجم المجموعة:</span>
                      <span className={`font-medium ${
                        group.participant_count === 4 ? 'text-green-400' :
                        group.participant_count === 3 ? 'text-yellow-400' :
                        group.participant_count === 5 ? 'text-orange-400' :
                        'text-red-400'
                      }`}>
                        {group.participant_count} أشخاص
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {groupAssignments.length > 0 && (
          <div className="border-t border-white/10 p-4 bg-white/5">
            <div className="flex items-center justify-between text-sm">
              <div className="text-slate-400">
                إجمالي: {totalGroups} مجموعة • {totalParticipants} مشارك
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-400"></div>
                  <span className="text-slate-400">4 أشخاص (مثالي)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                  <span className="text-slate-400">3 أشخاص</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                  <span className="text-slate-400">5 أشخاص</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
