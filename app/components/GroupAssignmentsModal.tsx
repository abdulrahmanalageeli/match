import { X, Users, MapPin, Star, Shuffle, AlertTriangle, Loader2, Sparkles, Layers, CheckCircle2, Pencil, Check, RefreshCcw, Search, Info } from "lucide-react"
import { useRef, useState } from "react"

interface GroupAssignment {
  group_number: number
  table_number: number
  participants: Array<{
    number: number
    name: string
    age?: number
    attended?: boolean
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
  cohostTheme?: boolean
}

export default function GroupAssignmentsModal({
  isOpen,
  onClose,
  groupAssignments,
  totalGroups,
  totalParticipants,
  eventId = 1,
  onSwapApplied,
  cohostTheme = false
}: GroupAssignmentsModalProps) {
  if (!isOpen) return null

  const [selected, setSelected] = useState<{ group: number; participant: number } | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [autoPlacing, setAutoPlacing] = useState(false)
  const [autoPlaceNumber, setAutoPlaceNumber] = useState<string>("")
  const [editingGroupNums, setEditingGroupNums] = useState<Record<number, string>>({})
  const [savingGroupNum, setSavingGroupNum] = useState<number | null>(null)
  // Search & focus state
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [highlightedParticipant, setHighlightedParticipant] = useState<number | null>(null)
  const [searchMatches, setSearchMatches] = useState<number[]>([])
  const [searchIndex, setSearchIndex] = useState(0)
  const [lastSearchTerm, setLastSearchTerm] = useState("")
  // Preview alternatives (Top 3) and finalize
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewArrangements, setPreviewArrangements] = useState<Array<{
    label: string
    groupMatches: Array<{
      group_id: string
      group_number: number
      table_number: number
      participant_numbers: number[]
      participant_names?: string[]
      compatibility_score: number
    }>
  }> | null>(null)
  const [activeArrangement, setActiveArrangement] = useState(0)
  const [finalizing, setFinalizing] = useState(false)
  // Dual view modes: modify vs seating (host view)
  const [viewMode, setViewMode] = useState<'modify' | 'seating'>('modify')
  // Attendance saving states (by participant number)
  const [attendanceSaving, setAttendanceSaving] = useState<Record<number, boolean>>({})
  // Manual refresh state for seating view
  const [viewRefreshing, setViewRefreshing] = useState(false)
  // Structured confirmation state for clearer warning display
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmData, setConfirmData] = useState<{
    payload: { groupA_number: number; participantA: number; groupB_number: number; participantB: number | null; allowOverride: boolean }
    warnings: Record<number, string[]>
    proposed: Record<number, { participant_numbers: number[]; compatibility_score: number }>
    currentScores: Record<number, number>
    moveType: 'move' | 'swap' | 'reorder'
  } | null>(null)

  // Per-group breakdown (Spark-Only) modal state
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const [breakdownLoading, setBreakdownLoading] = useState(false)
  const [breakdownGroup, setBreakdownGroup] = useState<number | null>(null)
  const [breakdownData, setBreakdownData] = useState<null | {
    average: number
    adjusted?: number
    constraints?: {
      gender_balance?: boolean
      female_cap_ok?: boolean
      initiator_known?: boolean
      initiator_present?: boolean | null
      conversation_compatible?: boolean
      age_range?: number | null
    }
    factors?: Array<{ name: string; delta: number | string; info?: string }>
    participant_numbers: number[]
    pairs: Array<{
      a: number
      b: number
      totals: { pairTotal: number; synergy: number; humor_open: number; vibe: number; lifestyle: number; core_values: number }
    }>
  }>(null)

  async function openBreakdown(group: GroupAssignment) {
    const nums = group.participants.map(p => p.number)
    setBreakdownOpen(true)
    setBreakdownLoading(true)
    setBreakdownGroup(group.group_number)
    setBreakdownData(null)
    try {
      const res = await fetch('/api/admin/trigger-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchType: 'group', eventId, action: 'compute-group-breakdown', participant_numbers: nums })
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        alert(data?.error || 'تعذر حساب تفاصيل المجموعة')
      } else {
        setBreakdownData({
          average: data.average,
          adjusted: data.adjusted,
          constraints: data.constraints,
          factors: data.factors,
          participant_numbers: data.participant_numbers,
          pairs: data.pairs || []
        })
      }
    } catch (e) {
      console.error('breakdown error', e)
      alert('حدث خطأ أثناء حساب التفاصيل')
    } finally {
      setBreakdownLoading(false)
    }
  }

  async function attemptSwap(target: { group: number; participant: number | null }) {
    const isEmptyTarget = !target.participant || target.participant === 0
    if (!selected) {
      if (!isEmptyTarget) setSelected(target as { group: number; participant: number })
      return
    }

    if (!isEmptyTarget && selected.group === target.group && selected.participant === target.participant) {
      setSelected(null)
      return
    }

    if (isEmptyTarget && selected.group === target.group) {
      return
    }

    const payload = {
      action: "swap-group-participants",
      event_id: eventId,
      groupA_number: selected.group,
      participantA: selected.participant,
      groupB_number: target.group,
      participantB: isEmptyTarget ? null : target.participant,
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

      if (data && data.success === false && data.warnings) {
        // Build current scores snapshot from UI state
        const currentScores: Record<number, number> = {}
        const gA = groupAssignments.find(g => g.group_number === payload.groupA_number)
        const gB = groupAssignments.find(g => g.group_number === payload.groupB_number)
        if (gA) currentScores[payload.groupA_number] = Math.round(gA.compatibility_score || 0)
        if (gB) currentScores[payload.groupB_number] = Math.round(gB.compatibility_score || 0)

        setConfirmData({
          payload,
          warnings: data.warnings || {},
          proposed: data.proposed || {},
          currentScores,
          moveType: payload.groupA_number === payload.groupB_number
            ? 'reorder'
            : (isEmptyTarget ? 'move' : 'swap')
        })
        setShowConfirm(true)
        // Do not proceed now; wait for user confirmation
        setSwapping(false)
        return
      }

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

  // Compute which groups to display: preview (if active) or current DB state
  const isPreviewActive = !!previewArrangements && previewArrangements.length > 0
  const computedDisplayGroups: GroupAssignment[] = (() => {
    if (!isPreviewActive) return groupAssignments
    const idx = Math.min(Math.max(activeArrangement, 0), (previewArrangements?.length || 1) - 1)
    const gm = previewArrangements?.[idx]?.groupMatches || []
    const mapped = gm.map((match) => {
      const participants = (match.participant_numbers || []).map((num, i) => ({
        number: num,
        name: match.participant_names?.[i] || `المشارك #${num}`,
        attended: false
      }))
      return {
        group_number: match.group_number,
        table_number: match.table_number,
        participants,
        compatibility_score: match.compatibility_score,
        participant_count: participants.length
      } as GroupAssignment
    })
    return mapped
  })()

  async function toggleAttendance(pNumber: number, current: boolean) {
    try {
      setAttendanceSaving(prev => ({ ...prev, [pNumber]: true }))
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-attendance', event_id: eventId, participant_number: pNumber, attended: !current })
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        alert(data?.error || 'تعذر حفظ الحضور')
        return
      }
      if (onSwapApplied) await onSwapApplied()
    } catch (e) {
      console.error('toggle attendance error', e)
      alert('حدث خطأ أثناء حفظ الحضور')
    } finally {
      setAttendanceSaving(prev => { const cp = { ...prev }; delete cp[pNumber]; return cp })
    }
  }

  // Auto-refresh removed per request; hosts will use a manual refresh button instead

  return (
    <div className={`fixed inset-0 ${cohostTheme ? 'bg-violet-900/40' : 'bg-black/50'} backdrop-blur-sm flex items-center justify-center p-4 z-50`}>
      <div className={`${cohostTheme ? 'bg-gradient-to-br from-violet-950 via-slate-900 to-violet-950 border-4 border-violet-400/30 rounded-3xl' : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/20 rounded-2xl'} shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col min-h-0`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${cohostTheme ? 'border-violet-400/20' : 'border-white/10'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cohostTheme ? 'bg-gradient-to-br from-violet-600 to-indigo-600' : 'bg-gradient-to-br from-blue-500 to-purple-600'}`}>
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white text-lg font-semibold">المجموعات</h3>
              <p className="text-slate-400 text-xs">إجمالي: {totalGroups} مجموعة • {totalParticipants} مشارك</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-white transition-colors ${cohostTheme ? 'bg-violet-500/20 hover:bg-violet-500/30' : 'bg-white/10 hover:bg-white/20'}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* View mode toggle */}
        <div className={`px-4 py-3 border-b ${cohostTheme ? 'border-violet-400/20' : 'border-white/10'} bg-white/5`}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('modify')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'modify' ? (cohostTheme ? 'bg-violet-500/30 text-white' : 'bg-white/15 text-white') : (cohostTheme ? 'bg-violet-500/10 text-slate-300 hover:bg-violet-500/20' : 'bg-white/5 text-slate-300 hover:bg-white/10')}`}
            >
              تعديل المجموعات
            </button>
            <button
              onClick={() => setViewMode('seating')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'seating' ? (cohostTheme ? 'bg-violet-500/30 text-white' : 'bg-white/15 text-white') : (cohostTheme ? 'bg-violet-500/10 text-slate-300 hover:bg-violet-500/20' : 'bg-white/5 text-slate-300 hover:bg-white/10')}`}
            >
              عرض المقاعد (للمضيف)
            </button>
          </div>
        </div>
        {/* Search bar */}
        <div className={`px-4 py-3 border-b ${cohostTheme ? 'border-violet-400/20' : 'border-white/10'} bg-white/5`}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const q = (searchQuery || '').trim()
              if (!q) return
              const lowered = q.toLowerCase()
              let targetNumber: number | null = null
              // Numeric search goes directly to that participant
              if (/^#?\d+$/.test(lowered)) {
                const num = parseInt(lowered.replace('#', ''), 10)
                if (Number.isFinite(num)) {
                  targetNumber = num
                  // reset cycling for numeric queries
                  setSearchMatches([num])
                  setSearchIndex(0)
                  setLastSearchTerm(lowered)
                }
              } else {
                // Name search: build all matches then cycle index on repeated submits
                const matches: number[] = []
                for (const g of computedDisplayGroups) {
                  for (const p of g.participants) {
                    if ((p.name || '').toLowerCase().includes(lowered)) matches.push(p.number)
                  }
                }
                if (matches.length === 0) {
                  alert('لم يتم العثور على المشارك')
                  return
                }
                const nextIndex = (lastSearchTerm === lowered && searchMatches.length > 0)
                  ? (searchIndex + 1) % matches.length
                  : 0
                targetNumber = matches[nextIndex]
                setSearchMatches(matches)
                setSearchIndex(nextIndex)
                setLastSearchTerm(lowered)
              }
              if (targetNumber == null) {
                alert('لم يتم العثور على المشارك')
                return
              }
              setHighlightedParticipant(targetNumber)
              const container = contentRef.current
              const doScroll = (targetEl: HTMLElement, cont?: HTMLElement | null) => {
                if (cont) {
                  try {
                    const contRect = cont.getBoundingClientRect()
                    const elRect = targetEl.getBoundingClientRect()
                    const offset = elRect.top - contRect.top
                    const targetTop = cont.scrollTop + offset - Math.max((cont.clientHeight - targetEl.clientHeight) / 2, 0)
                    cont.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' })
                    return
                  } catch {}
                }
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
              }
              if (container) {
                const nodes = Array.from(container.querySelectorAll(`[data-participant="${targetNumber}"]`)) as HTMLElement[]
                const el = nodes.find(n => n.closest('[data-view]')?.getAttribute('data-view') === viewMode && n.offsetParent !== null)
                  || nodes.find(n => n.offsetParent !== null)
                if (el) doScroll(el, container)
              }
              setTimeout(() => setHighlightedParticipant(null), 1800)
            }}
            className="flex items-center gap-2"
          >
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالاسم أو الرقم (مثال: مريم أو #123)"
                className={`${cohostTheme ? 'bg-violet-950/40 border border-violet-400/20 focus:ring-violet-400/40 text-white placeholder:text-violet-200/60' : 'bg-slate-900/60 border border-white/10 focus:ring-cyan-400/40 text-white placeholder:text-slate-300/60'} w-full pl-8 pr-3 py-1.5 rounded-md text-sm focus:outline-none focus:ring-2`}
              />
            </div>
            <button
              type="submit"
              className={`${cohostTheme ? 'bg-violet-500/20 hover:bg-violet-500/30 text-white' : 'bg-white/10 hover:bg-white/20 text-white'} inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors`}
            >
              <Search className="w-4 h-4" />
              بحث
            </button>
          </form>
        </div>

        {/* Content */}
        <div ref={contentRef} className="p-3 sm:p-6 pb-10 overflow-y-auto flex-1 min-h-0">
          <div data-view="modify" className={`${viewMode === 'modify' ? '' : 'hidden'}`}>
          {/* Preview Top 3 Controls */}
          <div className="mb-4 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-300">
                <Layers className="w-4 h-4" />
                <span>معاينة أفضل 3 توزيعات قبل الحفظ</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={previewLoading || swapping || autoPlacing}
                  onClick={async () => {
                    setPreviewLoading(true)
                    try {
                      const res = await fetch('/api/admin/trigger-match', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ matchType: 'group', eventId, action: 'preview-groups-topk', topK: 3 })
                      })
                      const data = await res.json()
                      if (!res.ok || !data?.success) {
                        alert(data?.error || 'فشل في جلب البدائل')
                      } else {
                        setPreviewArrangements(data.arrangements || [])
                        setActiveArrangement(0)
                      }
                    } catch (e) {
                      console.error('preview error', e)
                      alert('حدث خطأ أثناء المعاينة')
                    } finally {
                      setPreviewLoading(false)
                    }
                  }}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${previewLoading ? 'bg-cyan-500/30 text-cyan-200 cursor-wait' : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200'}`}
                  title="احسب أفضل 3 توزيعات (بدون حفظ)"
                >
                  {previewLoading ? (
                    <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الحساب...</span>
                  ) : (
                    <span className="inline-flex items-center gap-2"><Sparkles className="w-4 h-4" /> معاينة أفضل 3</span>
                  )}
                </button>
                {isPreviewActive && (
                  <button
                    disabled={finalizing}
                    onClick={async () => {
                      if (!previewArrangements || previewArrangements.length === 0) return
                      const idx = Math.min(Math.max(activeArrangement, 0), previewArrangements.length - 1)
                      const chosen = previewArrangements[idx]
                      if (!chosen?.groupMatches?.length) { alert('لا توجد بيانات للحفظ'); return }
                      if (!confirm('سيتم حفظ هذا التوزيع كالمجموعات النهائية. هل أنت متأكد؟')) return
                      setFinalizing(true)
                      try {
                        const res = await fetch('/api/admin/trigger-match', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ matchType: 'group', eventId, action: 'finalize-groups-arrangement', arrangement: chosen.groupMatches })
                        })
                        const data = await res.json()
                        if (!res.ok || !data?.success) {
                          alert(data?.error || 'لم يتم حفظ التوزيع')
                        } else {
                          alert(`تم الحفظ: ${data.count} مجموعة`)
                          setPreviewArrangements(null)
                          setActiveArrangement(0)
                          if (onSwapApplied) await onSwapApplied()
                        }
                      } catch (e) {
                        console.error('finalize error', e)
                        alert('حدث خطأ أثناء الحفظ')
                      } finally {
                        setFinalizing(false)
                      }
                    }}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors ${finalizing ? 'bg-emerald-500/30 text-emerald-200 cursor-wait' : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200'}`}
                    title="حفظ هذا التوزيع في قاعدة البيانات"
                  >
                    <span className="inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> اعتماد هذا التوزيع</span>
                  </button>
                )}
              </div>
            </div>
            {isPreviewActive && (
              <div className="flex items-center gap-2">
                {previewArrangements!.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveArrangement(idx)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${activeArrangement === idx ? (cohostTheme ? 'bg-violet-500/20 border-violet-400/40 text-white' : 'bg-white/10 border-white/30 text-white') : 'bg-transparent border-white/10 text-slate-300 hover:bg-white/5'}`}
                  >
                    {idx === 0 ? 'الأفضل' : idx === 1 ? 'الثاني' : 'الثالث'}
                  </button>
                ))}
                <span className="text-[11px] text-slate-400">المعاينة لا تحفظ تلقائياً</span>
              </div>
            )}
          </div>
          {/* Swap helper */}
          <div className="mb-4 flex items-center gap-2 text-xs sm:text-sm text-slate-300">
            <Shuffle className="w-4 h-4" />
            <span>اضغط على مشارك ثم اضغط على مشارك آخر للتبديل، أو اضغط على مقعد فارغ للنقل.</span>
            {selected && (
              <span className="inline-flex items-center gap-1 text-yellow-300">
                <AlertTriangle className="w-3 h-3" /> محدد: المجموعة {selected.group} • #{selected.participant}
              </span>
            )}
            {swapping && (
              <span className={`inline-flex items-center gap-1 ${cohostTheme ? 'text-violet-200' : 'text-cyan-300'}`}>
                <Loader2 className="w-3 h-3 animate-spin" /> جاري الحفظ...
              </span>
            )}
          </div>

          {/* Auto-place participant into best group (fills empty seat) */}
          <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="رقم المشارك للتوزيع التلقائي"
              className="w-40 sm:w-56 px-2 py-1 rounded-md bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              value={autoPlaceNumber}
              onChange={(e) => setAutoPlaceNumber(e.target.value)}
              disabled={autoPlacing || swapping || isPreviewActive}
            />
            <button
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${autoPlacing ? 'bg-cyan-500/30 text-cyan-200 cursor-wait' : isPreviewActive ? 'bg-slate-600/30 text-slate-300 cursor-not-allowed' : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200'}`}
              disabled={autoPlacing || swapping || isPreviewActive}
              onClick={async () => {
                const raw = autoPlaceNumber.trim()
                if (!raw) { alert('يرجى إدخال رقم المشارك'); return }
                const num = parseInt(raw)
                if (!Number.isFinite(num) || num <= 0) { alert('رقم مشارك غير صالح'); return }
                setAutoPlacing(true)
                try {
                  const res = await fetch('/api/admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'auto-place-participant-into-best-group',
                      event_id: eventId,
                      participant_number: num
                    })
                  })
                  const data = await res.json()
                  if (!res.ok || !data.success) {
                    alert(data?.error || 'فشل توزيع المشارك تلقائياً')
                    return
                  }
                  // Optional: Show which group they were placed into
                  if (data.group?.group_number) {
                    alert(`تمت إضافة المشارك #${num} إلى المجموعة ${data.group.group_number}`)
                  }
                  if (onSwapApplied) await onSwapApplied()
                  setAutoPlaceNumber("")
                } catch (err) {
                  console.error('auto-place error', err)
                  alert('حدث خطأ أثناء التوزيع')
                } finally {
                  setAutoPlacing(false)
                }
              }}
              title="يفحص كل المجموعات ويملأ مقعداً فارغاً وفق أعلى توافق"
            >
              {autoPlacing ? 'جارٍ التوزيع...' : 'توزيع تلقائي'}
            </button>
            <span className="text-slate-400">يفحص كل المجموعات ويملأ مقعداً فارغاً</span>
          </div>

          {computedDisplayGroups.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-slate-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-300 mb-2">لا توجد مجموعات</h3>
              <p className="text-slate-500">لم يتم إنشاء أي مجموعات بعد. قم بتشغيل مطابقة المجموعات أولاً.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {computedDisplayGroups.map((group) => (
                <div
                  key={group.group_number}
                  className={`rounded-xl overflow-hidden ${cohostTheme ? 'bg-violet-500/10 border border-violet-400/20' : 'bg-white/5 border border-white/10'}`}
                >
                  <div className={`p-3 sm:p-4 border-b flex items-center justify-between ${cohostTheme ? 'border-violet-400/20' : 'border-white/10'}`}>
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cohostTheme ? 'bg-gradient-to-br from-violet-600 to-indigo-600' : 'bg-gradient-to-br from-purple-500 to-indigo-600'}`}>
                        <MapPin className="w-4 h-4 text-white" />
                      </div>
                      <div className="space-y-1">
                        {editingGroupNums[group.group_number] !== undefined ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              inputMode="numeric"
                              className={`w-20 px-2 py-1 rounded-md text-right text-sm bg-slate-900/60 border ${cohostTheme ? 'border-violet-400/30 focus:ring-violet-400/40' : 'border-white/10 focus:ring-cyan-400/40'} text-white focus:outline-none focus:ring-2`}
                              value={editingGroupNums[group.group_number]}
                              onChange={(e) => setEditingGroupNums(prev => ({ ...prev, [group.group_number]: e.target.value }))}
                              disabled={savingGroupNum === group.group_number || swapping}
                            />
                            <button
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-md ${cohostTheme ? 'bg-violet-500/20 hover:bg-violet-500/30' : 'bg-emerald-500/20 hover:bg-emerald-500/30'} text-white`}
                              title="حفظ رقم المجموعة"
                              disabled={savingGroupNum === group.group_number || swapping}
                              onClick={async () => {
                                const raw = editingGroupNums[group.group_number]
                                const newNum = parseInt((raw || '').trim(), 10)
                                if (!Number.isFinite(newNum) || newNum <= 0) { alert('رقم مجموعة غير صالح'); return }
                                setSavingGroupNum(group.group_number)
                                try {
                                  const res = await fetch('/api/admin', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'update-group-number', event_id: eventId, old_group_number: group.group_number, new_group_number: newNum })
                                  })
                                  const data = await res.json()
                                  if (!res.ok || data?.success !== true) {
                                    alert(data?.error || 'لم يتم تحديث رقم المجموعة')
                                  } else {
                                    // Refresh from parent
                                    if (onSwapApplied) await onSwapApplied()
                                    setEditingGroupNums(prev => { const cp = { ...prev }; delete cp[group.group_number]; return cp })
                                  }
                                } catch (e) {
                                  console.error('update-group-number error', e)
                                  alert('حدث خطأ أثناء التحديث')
                                } finally {
                                  setSavingGroupNum(null)
                                }
                              }}
                            >
                              {savingGroupNum === group.group_number ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-md ${cohostTheme ? 'bg-violet-500/20 hover:bg-violet-500/30' : 'bg-white/10 hover:bg-white/20'} text-white`}
                              title="إلغاء"
                              onClick={() => setEditingGroupNums(prev => { const cp = { ...prev }; delete cp[group.group_number]; return cp })}
                              disabled={savingGroupNum === group.group_number}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="text-white text-sm sm:text-base font-semibold">المجموعة {group.group_number}</div>
                            <button
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${cohostTheme ? 'bg-violet-500/20 hover:bg-violet-500/30' : 'bg-white/10 hover:bg-white/20'} text-white`}
                              title="تعديل رقم المجموعة"
                              disabled={swapping}
                              onClick={() => setEditingGroupNums(prev => ({ ...prev, [group.group_number]: String(group.group_number) }))}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        <div className="text-slate-400 text-xs">الطاولة #{group.table_number || '—'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 text-yellow-300">
                        <Star className="w-4 h-4 fill-yellow-300" />
                        <span className="text-xs sm:text-sm font-semibold">{Math.round(group.compatibility_score || 0)}%</span>
                      </div>
                      <button
                        className={`${cohostTheme ? 'bg-violet-500/20 hover:bg-violet-500/30' : 'bg-white/10 hover:bg-white/20'} inline-flex items-center justify-center w-7 h-7 rounded-md text-white`}
                        title="عرض تحليل النتيجة"
                        onClick={() => openBreakdown(group)}
                        disabled={swapping || previewLoading}
                      >
                        {breakdownLoading && breakdownGroup === group.group_number ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Info className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-3 sm:p-4">
                    {/* Participants */}
                    <div className="space-y-2">
                      <div className="text-xs text-slate-400 font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" />
                        المشاركون ({group.participant_count}):
                      </div>
                      {group.participants.map((participant) => (
                        <div
                          key={participant.number}
                          data-view="modify"
                          data-participant={participant.number}
                          data-group={group.group_number}
                          onClick={() => !swapping && !isPreviewActive && attemptSwap({ group: group.group_number, participant: participant.number })}
                          className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border transition-colors cursor-pointer ${cohostTheme ? 'bg-gradient-to-r from-violet-500/10 to-violet-500/5' : 'bg-gradient-to-r from-white/10 to-white/5'} ${
                            selected && selected.group === group.group_number && selected.participant === participant.number
                              ? `${cohostTheme ? 'border-violet-300 ring-2 ring-violet-400/40' : 'border-cyan-300 ring-2 ring-cyan-400/40'}`
                              : `${cohostTheme ? 'border-violet-400/20 hover:border-violet-300/40' : 'border-white/20 hover:border-cyan-400/40'}`
                          } ${highlightedParticipant === participant.number ? `${cohostTheme ? 'ring-2 ring-white/40 bg-white/10' : 'ring-2 ring-white/40 bg-white/10'}` : ''}`}
                        >
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
                            <span className="text-white text-xs font-bold">#{participant.number}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-white text-xs sm:text-sm font-medium truncate`}>{participant.name}</span>
                              {participant.age && (
                                <span className="text-slate-400 text-xs shrink-0">({participant.age})</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Empty slot placeholders up to capacity (6) */}
                      {Array.from({ length: Math.max(0, 6 - group.participants.length) }).map((_, idx) => (
                        <div
                          key={`empty-${idx}`}
                          onClick={() => !swapping && !isPreviewActive && selected && selected.group !== group.group_number && attemptSwap({ group: group.group_number, participant: null })}
                          className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border-2 border-dashed transition-all ${
                            selected && selected.group !== group.group_number
                              ? 'border-cyan-400/40 hover:border-cyan-300 cursor-pointer'
                              : 'border-white/10 text-slate-500 cursor-default'
                          }`}
                          title={selected ? (selected.group !== group.group_number ? 'انقل المشارك المحدد إلى هذا المقعد' : 'لا يمكن التحريك داخل نفس المجموعة') : 'اختر مشاركاً أولاً ثم اضغط هنا للنقل'}
                        >
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-700/50 flex items-center justify-center shrink-0">
                            <span className="text-slate-400 text-xs font-bold">—</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-slate-400 text-xs sm:text-sm">مقعد فارغ</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Group Size Indicator */}
                    <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-white/10">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">حجم المجموعة:</span>
                        <span className={`px-2 py-0.5 rounded-full ${
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

          {/* Seating view (host-friendly) */}
          <div data-view="seating" className={`${viewMode === 'seating' ? '' : 'hidden'} space-y-4`}>
            <div className={`flex items-center justify-between ${cohostTheme ? 'bg-violet-500/10 border-violet-400/30' : 'bg-white/5 border-white/10'} border rounded-xl p-3`}>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-sm">عرض المقاعد للمضيفين</span>
                <span className="text-slate-300 text-xs">أرقام الطاولات، المجموعات، وأسماء المشاركين مع حالة الحضور</span>
              </div>
              <button
                onClick={async () => { if (!onSwapApplied) return; setViewRefreshing(true); try { await onSwapApplied() } finally { setViewRefreshing(false) } }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${viewRefreshing ? (cohostTheme ? 'bg-violet-500/20 text-violet-200 border-violet-400/40 cursor-wait' : 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40 cursor-wait') : (cohostTheme ? 'bg-violet-500/10 text-violet-200 border-violet-400/30 hover:bg-violet-500/20' : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10')}`}
                disabled={viewRefreshing}
                title="تحديث القائمة"
              >
                <RefreshCcw className={`w-3.5 h-3.5 ${viewRefreshing ? 'animate-spin' : ''}`} />
                <span>{viewRefreshing ? 'جار التحديث...' : 'تحديث'}</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {computedDisplayGroups
                .slice()
                .sort((a, b) => (a.table_number || a.group_number) - (b.table_number || b.group_number))
                .map(group => {
                  const presentCount = group.participants.filter(p => p.attended).length
                  return (
                    <div key={`seat-${group.group_number}`} className={`rounded-2xl border ${cohostTheme ? 'border-violet-400/30 bg-violet-500/10' : 'border-white/10 bg-white/5'} p-4`}> 
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-xs font-semibold ${cohostTheme ? 'bg-violet-500/20 text-violet-200' : 'bg-slate-700/50 text-slate-200'}`}>مجموعة {group.group_number}</span>
                          <span className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-xs font-semibold ${cohostTheme ? 'bg-indigo-500/20 text-indigo-200' : 'bg-slate-700/50 text-slate-200'}`}>الطاولة #{group.table_number || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-300">حضور:</span>
                          <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold ${presentCount > 0 ? 'bg-emerald-500/20 text-emerald-200' : 'bg-slate-700/60 text-slate-300'}`}>{presentCount}/{group.participant_count}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {group.participants.map(p => (
                          <div
                            key={`p-${group.group_number}-${p.number}`}
                            data-view="seating"
                            data-participant={p.number}
                            data-group={group.group_number}
                            className={`relative flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${p.attended ? 'border-emerald-400/30 bg-emerald-500/5' : 'border-white/10 bg-white/5'} ${highlightedParticipant === p.number ? `${cohostTheme ? 'ring-2 ring-white/40 bg-white/10' : 'ring-2 ring-white/40 bg-white/10'}` : ''}`}
                          >
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${p.attended ? 'bg-emerald-400/70' : 'bg-slate-600/40'}`}></div>
                            <div className="w-10 h-10 rounded-xl ring-2 ring-white/20 shadow-sm bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                              <span className="text-white text-base font-extrabold tabular-nums">#{p.number}</span>
                            </div>
                            <div className="text-white text-sm truncate flex-1 flex items-center gap-2">
                              <span className="truncate">{p.name}</span>
                              {p.age && (
                                <span className="text-slate-300 text-xs shrink-0">({p.age})</span>
                              )}
                            </div>
                            <button
                              className={`${p.attended ? (cohostTheme ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/30' : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30') : (cohostTheme ? 'bg-slate-700/60 text-slate-300 border-white/10' : 'bg-slate-700/50 text-slate-200 border-white/10')} inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors`}
                              title={p.attended ? 'حاضر - اضغط للتبديل' : 'غير حاضر - اضغط للتبديل'}
                              onClick={() => toggleAttendance(p.number, !!p.attended)}
                              disabled={!!attendanceSaving[p.number]}
                            >
                              {attendanceSaving[p.number] ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : p.attended ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>حاضر</span>
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span>غير حاضر</span>
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>

        {/* Footer */}
        {viewMode === 'modify' && computedDisplayGroups.length > 0 && (
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
      {/* Structured Confirmation Modal */}
      {showConfirm && confirmData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-white/15 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-2xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <div className="text-white font-semibold text-lg">تأكيد التبديل</div>
                <div className="text-slate-300 text-xs sm:text-sm">
                  {confirmData.moveType === 'swap' && `سيتم تبديل المشارك #${confirmData.payload.participantA} بين المجموعتين ${confirmData.payload.groupA_number} ↔ ${confirmData.payload.groupB_number}${confirmData.payload.participantB ? ` مع #${confirmData.payload.participantB}` : ''}.`}
                  {confirmData.moveType === 'move' && `سيتم نقل المشارك #${confirmData.payload.participantA} من المجموعة ${confirmData.payload.groupA_number} إلى المجموعة ${confirmData.payload.groupB_number}.`}
                  {confirmData.moveType === 'reorder' && `سيتم إعادة ترتيب المشاركين داخل المجموعة ${confirmData.payload.groupA_number}.`}
                </div>
              </div>
              <button onClick={() => { setShowConfirm(false); setConfirmData(null); setSelected(null); }} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">×</button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className={`grid grid-cols-1 ${confirmData.payload.groupA_number !== confirmData.payload.groupB_number ? 'md:grid-cols-2' : ''} gap-4`}>
                {[confirmData.payload.groupA_number, (confirmData.payload.groupB_number !== confirmData.payload.groupA_number ? confirmData.payload.groupB_number : undefined)].filter(Boolean).map((gnum) => {
                  const g = gnum as number
                  const current = confirmData.currentScores[g]
                  const proposed = confirmData.proposed?.[g]?.compatibility_score
                  const warnings = confirmData.warnings?.[g] || []
                  return (
                    <div key={g} className="rounded-xl border border-white/10 bg-white/5">
                      <div className="p-3 border-b border-white/10 flex items-center justify-between">
                        <div className="text-white font-semibold text-sm">المجموعة {g}</div>
                        <div className="text-xs text-slate-300">النتيجة الحالية: <span className="text-white font-semibold">{typeof current === 'number' ? `${current}%` : '—'}</span></div>
                      </div>
                      <div className="p-3 space-y-3">
                        {typeof proposed === 'number' && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-300">النتيجة بعد التبديل</span>
                            <span className={`font-semibold ${proposed > (current || 0) ? 'text-green-300' : proposed < (current || 0) ? 'text-red-300' : 'text-amber-300'}`}>{proposed}%</span>
                          </div>
                        )}
                        <div className="text-slate-300 text-xs">التحذيرات:</div>
                        {warnings.length > 0 ? (
                          <ul className="list-disc list-inside space-y-1 text-xs text-amber-300">
                            {warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-xs text-green-300">لا توجد تحذيرات</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                راجع التحذيرات والنتائج المقترحة. بالمتابعة سيتم حفظ التبديل رغم التحذيرات.
              </div>
            </div>
            <div className="p-3 sm:p-4 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
                onClick={() => { setShowConfirm(false); setConfirmData(null); setSelected(null); }}
                disabled={confirming}
              >
                إلغاء
              </button>
              <button
                className={`px-3 py-1.5 rounded-lg text-sm ${confirming ? 'bg-cyan-500/30 text-cyan-200 cursor-wait' : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200'}`}
                disabled={confirming}
                onClick={async () => {
                  if (!confirmData) return
                  setConfirming(true)
                  try {
                    const res2 = await fetch('/api/admin', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ...confirmData.payload, allowOverride: true })
                    })
                    const data2 = await res2.json()
                    if (!res2.ok || !data2.success) {
                      alert(data2?.error || 'لم يتم حفظ التبديل')
                    } else {
                      setShowConfirm(false)
                      setConfirmData(null)
                      setSelected(null)
                      if (onSwapApplied) await onSwapApplied()
                    }
                  } catch (e) {
                    console.error('confirm swap error', e)
                    alert('حدث خطأ أثناء الحفظ')
                  } finally {
                    setConfirming(false)
                  }
                }}
              >
                متابعة وحفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group breakdown modal */}
      {breakdownOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={() => { setBreakdownOpen(false); setBreakdownGroup(null); setBreakdownData(null); }}>
          <div className={`w-full max-w-3xl rounded-2xl border ${cohostTheme ? 'border-violet-400/30 bg-gradient-to-br from-violet-950 via-slate-900 to-violet-950' : 'border-white/15 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950'} shadow-2xl overflow-hidden`} onClick={(e)=>e.stopPropagation()}>
            <div className={`p-4 border-b ${cohostTheme ? 'border-violet-400/20' : 'border-white/10'} flex items-center justify-between`}>
              <div className="text-white font-semibold text-lg">تحليل توافق المجموعة {breakdownGroup ?? ''}</div>
              <button className={`${cohostTheme ? 'bg-violet-500/20 hover:bg-violet-500/30' : 'bg-white/10 hover:bg-white/20'} w-8 h-8 rounded-lg text-white flex items-center justify-center`} onClick={() => { setBreakdownOpen(false); setBreakdownGroup(null); setBreakdownData(null); }}>×</button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {breakdownLoading ? (
                <div className="flex items-center gap-2 text-slate-300"><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الحساب...</div>
              ) : !breakdownData ? (
                <div className="text-slate-300 text-sm">لا توجد بيانات</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm gap-2 flex-wrap">
                    <div className="text-slate-300">المشاركون: {breakdownData.participant_numbers.map(n=>`#${n}`).join(' ، ')}</div>
                    <div className="flex items-center gap-3">
                      <div className="text-slate-200">المتوسط: <span className="text-white font-semibold">{breakdownData.average}%</span></div>
                      {typeof breakdownData.adjusted === 'number' && (
                        <div className="text-slate-200">المعدل بعد العوامل: <span className="text-white font-semibold">{breakdownData.adjusted}%</span></div>
                      )}
                    </div>
                  </div>
                  {/* Constraints summary */}
                  {breakdownData.constraints && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-200 space-y-2">
                      <div className="font-semibold text-slate-300">القيود (Constraints)</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div>توازن الجنسين: <span className={breakdownData.constraints.gender_balance ? 'text-green-300' : 'text-red-300'}>{breakdownData.constraints.gender_balance ? 'متوازن' : 'غير متوازن'}</span></div>
                        <div>حد الإناث ≤2: <span className={breakdownData.constraints.female_cap_ok ? 'text-green-300' : 'text-red-300'}>{breakdownData.constraints.female_cap_ok ? 'محقق' : 'تجاوز'}</span></div>
                        <div>معروف دور المبادر: <span className={(breakdownData.constraints.initiator_known ? 'text-green-300' : 'text-amber-300')}>{breakdownData.constraints.initiator_known ? 'نعم' : 'غير مكتمل'}</span></div>
                        <div>وجود مبادر: <span className={breakdownData.constraints.initiator_present ? 'text-green-300' : (breakdownData.constraints.initiator_present === null ? 'text-slate-300' : 'text-red-300')}>{breakdownData.constraints.initiator_present === null ? 'غير متوفر' : (breakdownData.constraints.initiator_present ? 'موجود' : 'غير موجود')}</span></div>
                        <div>توافق عمق الحوار: <span className={breakdownData.constraints.conversation_compatible ? 'text-green-300' : 'text-red-300'}>{breakdownData.constraints.conversation_compatible ? 'متوافق' : 'تعارض'}</span></div>
                        <div>مدى الأعمار: <span className={breakdownData.constraints.age_range != null ? (Number(breakdownData.constraints.age_range) <= 3 ? 'text-green-300' : 'text-slate-300') : 'text-slate-300'}>{breakdownData.constraints.age_range != null ? `${breakdownData.constraints.age_range} سنوات` : 'غير معروف'}</span></div>
                      </div>
                    </div>
                  )}
                  <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                    <div className="grid grid-cols-6 gap-0 text-xs font-semibold text-slate-300 border-b border-white/10">
                      <div className="p-2">الثنائي</div>
                      <div className="p-2 text-right">المجموع</div>
                      <div className="p-2 text-right">التفاعل</div>
                      <div className="p-2 text-right">المرح/الانفتاح</div>
                      <div className="p-2 text-right">الاهتمامات</div>
                      <div className="p-2 text-right">نمط الحياة/القيم</div>
                    </div>
                    <div>
                      {breakdownData.pairs.map((pr, idx) => (
                        <div key={idx} className="grid grid-cols-6 items-center text-xs border-b border-white/5 last:border-b-0">
                          <div className="p-2 text-slate-200">#{pr.a} × #{pr.b}</div>
                          <div className="p-2 text-right text-white font-semibold">{pr.totals.pairTotal}%</div>
                          <div className="p-2 text-right text-slate-200">{pr.totals.synergy}%</div>
                          <div className="p-2 text-right text-slate-200">{pr.totals.humor_open}%</div>
                          <div className="p-2 text-right text-slate-200">{pr.totals.vibe}%</div>
                          <div className="p-2 text-right text-slate-200">{pr.totals.lifestyle + pr.totals.core_values}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400">المجموع = التفاعل (45%) + المرح/الانفتاح (30%) + الاهتمامات (15%) + نمط الحياة (5%) + القيم (5%)</div>
                  {/* Factors (bonuses/penalties) */}
                  {breakdownData.factors && breakdownData.factors.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                      <div className="p-2 text-xs font-semibold text-slate-300 border-b border-white/10">العوامل المطبقة (المكافآت/العقوبات)</div>
                      <ul className="text-xs text-slate-200 divide-y divide-white/5">
                        {breakdownData.factors.map((f, i) => (
                          <li key={i} className="flex items-center justify-between p-2">
                            <span className="truncate">{f.name}{f.info ? ` — ${f.info}` : ''}</span>
                            <span className={typeof f.delta === 'number' ? (Number(f.delta) >= 0 ? 'text-green-300' : 'text-red-300') : 'text-amber-300'}>{typeof f.delta === 'number' ? (Number(f.delta) >= 0 ? `+${f.delta}` : `${f.delta}`) : String(f.delta)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className={`p-3 border-t ${cohostTheme ? 'border-violet-400/20' : 'border-white/10'} flex items-center justify-end`}>
              <button className={`${cohostTheme ? 'bg-violet-500/20 hover:bg-violet-500/30' : 'bg-white/10 hover:bg-white/20'} px-3 py-1.5 rounded-lg text-white text-sm`} onClick={() => { setBreakdownOpen(false); setBreakdownGroup(null); setBreakdownData(null); }}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
