import { X, Users, MapPin, Star, Shuffle, AlertTriangle, Loader2 } from "lucide-react"
import { useState } from "react"

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
  eventId?: number
  onSwapApplied?: () => Promise<void> | void
}

export default function GroupAssignmentsModal({
  isOpen,
  onClose,
  groupAssignments,
  totalGroups,
  totalParticipants,
  eventId = 1,
  onSwapApplied
}: GroupAssignmentsModalProps) {
  if (!isOpen) return null

  const [selected, setSelected] = useState<{ group: number; participant: number } | null>(null)
  const [swapping, setSwapping] = useState(false)

  async function attemptSwap(target: { group: number; participant: number }) {
    if (!selected) {
      setSelected(target)
      return
    }

    // If clicking same participant, unselect
    if (selected.group === target.group && selected.participant === target.participant) {
      setSelected(null)
      return
    }

    // Build swap payload so that A is the first selected, B is the second selected
    const payload = {
      action: "swap-group-participants",
      event_id: eventId,
      groupA_number: selected.group,
      participantA: selected.participant,
      groupB_number: target.group,
      participantB: target.participant,
      allowOverride: false
    }

    setSwapping(true)
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (!res.ok) {
        alert(data?.error || "فشل تبديل المشاركين")
        setSelected(null)
        return
      }

      // If there are warnings and not overridden, ask for confirmation
      if (data && data.success === false && data.warnings) {
        const wa = data.warnings[payload.groupA_number] || []
        const wb = data.warnings[payload.groupB_number] || []
        const proposedA = data.proposed?.[payload.groupA_number]?.compatibility_score
        const proposedB = data.proposed?.[payload.groupB_number]?.compatibility_score
        const msg = [
          "⚠️ توجد تحذيرات أهلية للمجموعتين:",
          wa.length ? `\nالمجموعة ${payload.groupA_number}:\n- ${wa.join("\n- ")}` : "",
          wb.length ? `\nالمجموعة ${payload.groupB_number}:\n- ${wb.join("\n- ")}` : "",
          (proposedA !== undefined && proposedB !== undefined)
            ? `\nالدراجات المقترحة بعد التبديل → المجموعة ${payload.groupA_number}: ${proposedA}%، المجموعة ${payload.groupB_number}: ${proposedB}%`
            : ""
        ].filter(Boolean).join("\n")

        const proceed = confirm(`${msg}\n\nهل تريد المتابعة على أي حال؟`)
        if (!proceed) { setSelected(null); return }

        // Re-send with override=true to persist
        const res2 = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, allowOverride: true })
        })
        const data2 = await res2.json()
        if (!res2.ok || !data2.success) {
          alert(data2?.error || "لم يتم حفظ التبديل")
          setSelected(null)
          return
        }
      }

      // Success path (no warnings or override applied)
      if (onSwapApplied) await onSwapApplied()
      setSelected(null)
    } catch (err) {
      console.error("swap error", err)
      alert("حدث خطأ أثناء التبديل")
      setSelected(null)
    } finally {
      setSwapping(false)
    }
  }

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
          {/* Swap helper */}
          <div className="mb-4 flex items-center gap-2 text-xs sm:text-sm text-slate-300">
            <Shuffle className="w-4 h-4" />
            <span>اضغط على مشارك ثم اضغط على مشارك آخر للتبديل بين المجموعتين.</span>
            {selected && (
              <span className="inline-flex items-center gap-1 text-yellow-300">
                <AlertTriangle className="w-3 h-3" /> محدد: المجموعة {selected.group} • #{selected.participant}
              </span>
            )}
            {swapping && (
              <span className="inline-flex items-center gap-1 text-cyan-300">
                <Loader2 className="w-3 h-3 animate-spin" /> جاري الحفظ...
              </span>
            )}
          </div>
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
                          onClick={() => !swapping && attemptSwap({ group: group.group_number, participant: participant.number })}
                          className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-gradient-to-r from-white/10 to-white/5 border transition-all cursor-pointer ${
                            selected && selected.group === group.group_number && selected.participant === participant.number
                              ? 'border-cyan-300 ring-2 ring-cyan-400/40'
                              : 'border-white/20 hover:border-cyan-400/40'
                          }`}
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
