import { useEffect, useMemo, useState } from "react"
import { X, Users, AlertTriangle, CheckCircle, XCircle, Search, ChevronDown, ChevronUp, DollarSign, Lock, Unlock } from "lucide-react"

interface PartnerMatch {
  partner_assigned_number: number
  partner_name: string
  partner_paid_done: boolean
  compatibility_score: number
  mbti_compatibility_score?: number
  attachment_compatibility_score?: number
  communication_compatibility_score?: number
  lifestyle_compatibility_score?: number
  core_values_compatibility_score?: number
  vibe_compatibility_score?: number
  humor_early_openness_bonus?: 'full' | 'partial' | 'none'
  is_organizer_match?: boolean
  table_number?: number | null
  reason?: string
  round?: number | null
}

export interface DualResultRow {
  assigned_number: number
  name: string
  paid_done: boolean
  sameMatch: PartnerMatch | null
  oppositeMatch: PartnerMatch | null
}

interface ParticipantDualResultsModalProps {
  isOpen: boolean
  onClose: () => void
  results: DualResultRow[]
  loading?: boolean
  cohostTheme?: boolean
  onRefresh?: () => Promise<void> | void
}

function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-300"
  if (score >= 60) return "text-cyan-300"
  if (score >= 45) return "text-amber-300"
  return "text-rose-300"
}

function MatchSide({
  side,
  match,
  selfNumber,
  isLocked,
  loadingLock,
  onLock,
  onUnlock,
}: {
  side: 'same' | 'opposite'
  match: PartnerMatch | null
  selfNumber: number
  isLocked: boolean
  loadingLock: boolean
  onLock: () => void
  onUnlock: () => void
}) {
  const isSame = side === 'same'
  const accent = isSame
    ? "from-cyan-600/30 to-blue-700/20 border-cyan-400/30"
    : "from-rose-600/30 to-orange-600/20 border-rose-400/30"
  const label = isSame ? "نفس الجنس (R1)" : "الجنس الآخر (R2)"

  if (!match) {
    return (
      <div className={`flex-1 p-3 rounded-lg border bg-gradient-to-br ${accent} flex flex-col gap-1`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white/80">{label}</span>
          <XCircle className="w-4 h-4 text-rose-300" />
        </div>
        <div className="text-sm text-white/60 italic">لا توجد مطابقة</div>
      </div>
    )
  }

  const isOrganizer = match.is_organizer_match
  const canLock = !isOrganizer && match.partner_assigned_number && match.partner_assigned_number !== 9999

  return (
    <div className={`flex-1 p-3 rounded-lg border bg-gradient-to-br ${accent} flex flex-col gap-1`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/80">{label}</span>
        <div className="flex items-center gap-1.5">
          {isLocked && (
            <span title="Match locked" className="inline-flex items-center text-emerald-300">
              <Lock className="w-3.5 h-3.5" />
            </span>
          )}
          {isOrganizer ? (
            <AlertTriangle className="w-4 h-4 text-amber-300" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-300" />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-white truncate">
          <span className="font-semibold">#{match.partner_assigned_number}</span>{" "}
          <span className="text-white/80">{isOrganizer ? "منظم الحدث" : match.partner_name}</span>
        </div>
        {match.partner_paid_done && (
          <span title="Paid" className="inline-flex items-center text-emerald-300">
            <DollarSign className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={`font-bold ${scoreColor(match.compatibility_score)}`}>
          {Math.round(match.compatibility_score)}%
        </span>
        {match.table_number != null && (
          <span className="text-white/60">طاولة {match.table_number}</span>
        )}
      </div>
      {(match.mbti_compatibility_score != null || match.vibe_compatibility_score != null) && (
        <div className="grid grid-cols-3 gap-1 text-[10px] text-white/70 mt-1">
          {match.mbti_compatibility_score != null && (
            <span title="MBTI">M:{Math.round(match.mbti_compatibility_score)}</span>
          )}
          {match.attachment_compatibility_score != null && (
            <span title="Attachment">A:{Math.round(match.attachment_compatibility_score)}</span>
          )}
          {match.communication_compatibility_score != null && (
            <span title="Communication">C:{Math.round(match.communication_compatibility_score)}</span>
          )}
          {match.lifestyle_compatibility_score != null && (
            <span title="Lifestyle">L:{Math.round(match.lifestyle_compatibility_score)}</span>
          )}
          {match.core_values_compatibility_score != null && (
            <span title="Core Values">V:{Math.round(match.core_values_compatibility_score)}</span>
          )}
          {match.vibe_compatibility_score != null && (
            <span title="Vibe">~:{Math.round(match.vibe_compatibility_score)}</span>
          )}
        </div>
      )}
      {canLock && (
        <div className="mt-1.5 pt-1.5 border-t border-white/10">
          {isLocked ? (
            <button
              onClick={onUnlock}
              disabled={loadingLock}
              className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-red-500/20 border border-red-400/30 text-red-300 hover:bg-red-500/30 transition-all text-xs disabled:opacity-50"
              title="إلغاء تثبيت المطابقة"
            >
              <Unlock className="w-3 h-3" />
              <span>إلغاء تثبيت</span>
            </button>
          ) : (
            <button
              onClick={onLock}
              disabled={loadingLock}
              className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/30 transition-all text-xs disabled:opacity-50"
              title="تثبيت المطابقة"
            >
              <Lock className="w-3 h-3" />
              <span>تثبيت</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function ParticipantDualResultsModal({
  isOpen,
  onClose,
  results,
  loading = false,
  cohostTheme = false,
  onRefresh,
}: ParticipantDualResultsModalProps) {
  const [search, setSearch] = useState("")
  const [showOnlyMissing, setShowOnlyMissing] = useState(false)
  const [showOnlyOrganizer, setShowOnlyOrganizer] = useState(false)
  const [sortBy, setSortBy] = useState<'number' | 'name' | 'avgScore'>('number')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Lock state
  const [lockedMatches, setLockedMatches] = useState<any[]>([])
  // Loading key: `${selfNumber}_${side}` to avoid double-clicks per side
  const [loadingLockKey, setLoadingLockKey] = useState<string | null>(null)

  const fetchLockedMatches = async () => {
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-locked-matches" }),
      })
      const data = await res.json()
      if (res.ok) setLockedMatches(data.lockedMatches || [])
    } catch (err) {
      console.error("Error fetching locked matches:", err)
    }
  }

  useEffect(() => {
    if (isOpen) fetchLockedMatches()
  }, [isOpen])

  const isPairLocked = (a: number, b: number) => {
    return lockedMatches.some(l =>
      (l.participant1_number === a && l.participant2_number === b) ||
      (l.participant1_number === b && l.participant2_number === a)
    )
  }

  const findLockId = (a: number, b: number) => {
    const found = lockedMatches.find(l =>
      (l.participant1_number === a && l.participant2_number === b) ||
      (l.participant1_number === b && l.participant2_number === a)
    )
    return found?.id ?? null
  }

  const handleLock = async (selfNumber: number, side: 'same' | 'opposite', match: PartnerMatch) => {
    if (!match.partner_assigned_number || match.partner_assigned_number === 9999) return
    const key = `${selfNumber}_${side}`
    setLoadingLockKey(key)
    try {
      const round = side === 'same' ? 1 : 2
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-locked-match",
          participant1: selfNumber,
          participant2: match.partner_assigned_number,
          compatibilityScore: match.compatibility_score,
          round,
          reason: `Admin locked from dual modal (${side === 'same' ? 'R1 same-gender' : 'R2 opposite-gender'})`,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        await fetchLockedMatches()
      } else {
        console.error("Error locking match:", data.error)
      }
    } catch (err) {
      console.error("Error locking match:", err)
    } finally {
      setLoadingLockKey(null)
    }
  }

  const handleUnlock = async (selfNumber: number, side: 'same' | 'opposite', match: PartnerMatch) => {
    if (!match.partner_assigned_number) return
    const key = `${selfNumber}_${side}`
    setLoadingLockKey(key)
    try {
      const lockId = findLockId(selfNumber, match.partner_assigned_number)
      if (!lockId) return
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-locked-match", id: lockId }),
      })
      const data = await res.json()
      if (res.ok) {
        await fetchLockedMatches()
      } else {
        console.error("Error unlocking match:", data.error)
      }
    } catch (err) {
      console.error("Error unlocking match:", err)
    } finally {
      setLoadingLockKey(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = results.filter((r) => {
      if (q) {
        const inName = r.name.toLowerCase().includes(q)
        const inNum = String(r.assigned_number).includes(q)
        const inSamePartner = r.sameMatch?.partner_name?.toLowerCase().includes(q) || String(r.sameMatch?.partner_assigned_number ?? '').includes(q)
        const inOppPartner = r.oppositeMatch?.partner_name?.toLowerCase().includes(q) || String(r.oppositeMatch?.partner_assigned_number ?? '').includes(q)
        if (!inName && !inNum && !inSamePartner && !inOppPartner) return false
      }
      if (showOnlyMissing && r.sameMatch && r.oppositeMatch) return false
      if (showOnlyOrganizer && !r.sameMatch?.is_organizer_match && !r.oppositeMatch?.is_organizer_match) return false
      return true
    })
    rows = [...rows].sort((a, b) => {
      let va: number | string = 0
      let vb: number | string = 0
      if (sortBy === 'number') { va = a.assigned_number; vb = b.assigned_number }
      else if (sortBy === 'name') { va = a.name; vb = b.name }
      else {
        const aSame = a.sameMatch?.compatibility_score ?? 0
        const aOpp = a.oppositeMatch?.compatibility_score ?? 0
        const bSame = b.sameMatch?.compatibility_score ?? 0
        const bOpp = b.oppositeMatch?.compatibility_score ?? 0
        va = (aSame + aOpp) / 2
        vb = (bSame + bOpp) / 2
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return rows
  }, [results, search, showOnlyMissing, showOnlyOrganizer, sortBy, sortDir])

  const stats = useMemo(() => {
    const total = results.length
    const withSame = results.filter(r => r.sameMatch && !r.sameMatch.is_organizer_match).length
    const withOpp = results.filter(r => r.oppositeMatch && !r.oppositeMatch.is_organizer_match).length
    const fullyMatched = results.filter(r => r.sameMatch && r.oppositeMatch && !r.sameMatch.is_organizer_match && !r.oppositeMatch.is_organizer_match).length
    return { total, withSame, withOpp, fullyMatched }
  }, [results])

  if (!isOpen) return null

  const themeBg = cohostTheme
    ? "bg-gradient-to-br from-purple-950/95 via-slate-950/95 to-fuchsia-950/95"
    : "bg-gradient-to-br from-slate-950/95 via-slate-900/95 to-indigo-950/95"

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" dir="rtl">
      <div className={`relative w-full max-w-7xl max-h-[92vh] rounded-2xl border border-white/10 ${themeBg} shadow-2xl flex flex-col overflow-hidden`}>
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-700 text-white">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">المطابقات المزدوجة (R1 + R2)</h2>
              <p className="text-xs text-white/60">نفس الجنس (الجولة 1) + الجنس الآخر (الجولة 2)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={() => onRefresh()}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm border border-white/10 transition-colors"
              >
                تحديث
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats + Filters */}
        <div className="flex-shrink-0 p-3 border-b border-white/10 bg-white/5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-1 rounded-md bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
              المشاركون: <strong>{stats.total}</strong>
            </span>
            <span className="px-2 py-1 rounded-md bg-cyan-500/20 text-cyan-200 border border-cyan-400/30">
              R1: <strong>{stats.withSame}</strong>
            </span>
            <span className="px-2 py-1 rounded-md bg-rose-500/20 text-rose-200 border border-rose-400/30">
              R2: <strong>{stats.withOpp}</strong>
            </span>
            <span className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
              مكتمل: <strong>{stats.fullyMatched}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
              <input
                type="text"
                placeholder="بحث..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-7 pl-2 py-1.5 rounded-md bg-white/10 border border-white/15 text-sm text-white placeholder-white/40 focus:outline-none focus:border-indigo-400/60"
              />
            </div>
            <button
              onClick={() => setShowOnlyMissing(v => !v)}
              className={`px-2 py-1.5 rounded-md text-xs border transition-colors ${
                showOnlyMissing
                  ? "bg-amber-500/30 text-amber-200 border-amber-400/40"
                  : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
              }`}
            >
              فقط الناقص
            </button>
            <button
              onClick={() => setShowOnlyOrganizer(v => !v)}
              className={`px-2 py-1.5 rounded-md text-xs border transition-colors ${
                showOnlyOrganizer
                  ? "bg-rose-500/30 text-rose-200 border-rose-400/40"
                  : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
              }`}
            >
              مع المنظم
            </button>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2 py-1.5 rounded-md bg-white/10 border border-white/15 text-xs text-white"
            >
              <option value="number">رقم</option>
              <option value="name">اسم</option>
              <option value="avgScore">معدل النسبة</option>
            </select>
            <button
              onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
              className="p-1.5 rounded-md bg-white/10 border border-white/15 text-white/80 hover:bg-white/20"
              aria-label="Toggle sort direction"
            >
              {sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="text-center text-white/70 py-10">جاري التحميل...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center text-white/60 py-10">
              لا توجد بيانات. شغّل "Generate Same-Gender (R1)" و "Generate Opposite-Gender (R2)" أولاً.
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map((row) => (
                <div
                  key={row.assigned_number}
                  className="rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/[0.07] transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/30 text-indigo-100 text-xs border border-indigo-400/40">
                        #{row.assigned_number}
                      </span>
                      <span className="text-white font-semibold">{row.name}</span>
                      {row.paid_done && (
                        <span className="inline-flex items-center text-emerald-300" title="Paid">
                          <DollarSign className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col md:flex-row gap-2">
                    <MatchSide
                      side="same"
                      match={row.sameMatch}
                      selfNumber={row.assigned_number}
                      isLocked={!!(row.sameMatch && row.sameMatch.partner_assigned_number && isPairLocked(row.assigned_number, row.sameMatch.partner_assigned_number))}
                      loadingLock={loadingLockKey === `${row.assigned_number}_same`}
                      onLock={() => row.sameMatch && handleLock(row.assigned_number, 'same', row.sameMatch)}
                      onUnlock={() => row.sameMatch && handleUnlock(row.assigned_number, 'same', row.sameMatch)}
                    />
                    <MatchSide
                      side="opposite"
                      match={row.oppositeMatch}
                      selfNumber={row.assigned_number}
                      isLocked={!!(row.oppositeMatch && row.oppositeMatch.partner_assigned_number && isPairLocked(row.assigned_number, row.oppositeMatch.partner_assigned_number))}
                      loadingLock={loadingLockKey === `${row.assigned_number}_opposite`}
                      onLock={() => row.oppositeMatch && handleLock(row.assigned_number, 'opposite', row.oppositeMatch)}
                      onUnlock={() => row.oppositeMatch && handleUnlock(row.assigned_number, 'opposite', row.oppositeMatch)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-3 border-t border-white/10 bg-white/5 text-xs text-white/60 flex justify-between">
          <span>عرض {filtered.length} من {results.length}</span>
          <span>R1 = نفس الجنس · R2 = الجنس الآخر</span>
        </div>
      </div>
    </div>
  )
}
