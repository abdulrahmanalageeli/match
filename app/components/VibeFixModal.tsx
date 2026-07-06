import React, { useState, useEffect, useCallback } from 'react'
import { X, Zap, CheckCircle, AlertCircle, RefreshCw, User } from 'lucide-react'

interface VibeFixModalProps {
  isOpen: boolean
  onClose: () => void
  eventId: number
}

interface ParticipantVibeStatus {
  number: number
  name: string
  gender: string
  cached_pairs: number
  bad_vibe_pairs: number
  avg_vibe: number | null
  models: string[]
  has_old_model: boolean
}

interface FixProgress {
  fixed: number
  skipped_good: number
  errors: number
  pairs_processed: number
  total_pairs: number | null
}

export default function VibeFixModal({ isOpen, onClose, eventId }: VibeFixModalProps) {
  const [participants, setParticipants] = useState<ParticipantVibeStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<FixProgress | null>(null)
  const [done, setDone] = useState(false)
  const [running, setRunning] = useState(false)
  const [activeTarget, setActiveTarget] = useState<number[] | 'all' | null>(null)
  const [paidOnly, setPaidOnly] = useState(true)
  const [skipNewModel, setSkipNewModel] = useState(true)
  const [fixedLog, setFixedLog] = useState<string[]>([])

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-vibe-status', event_id: eventId }),
      })
      const data = await res.json()
      if (res.ok) setParticipants(data.participants || [])
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    if (isOpen) {
      setProgress(null)
      setDone(false)
      fetchStatus()
    }
  }, [isOpen, fetchStatus])

  const runFix = async (participantNumbers?: number[], force = false) => {
    setRunning(true)
    setActiveTarget(participantNumbers ? participantNumbers : 'all')
    setProgress({ fixed: 0, skipped_good: 0, errors: 0, pairs_processed: 0, total_pairs: null })
    setDone(false)
    setFixedLog([])

    let cursor = 0
    let totalFixed = 0, totalSkipped = 0, totalErrors = 0, totalProcessed = 0

    try {
      while (true) {
        const res = await fetch('/api/admin/trigger-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'recalc-vibe',
            eventId,
            participant_numbers: participantNumbers || null,
            cursor,
            force,
            paidOnly,
            skipNewModel,
          }),
        })
        const data = await res.json()
        if (!res.ok) break

        totalFixed += data.fixed || 0
        totalSkipped += data.skipped_good || 0
        totalErrors += data.errors || 0
        totalProcessed += data.pairs_processed || 0

        if (data.fixed_pairs?.length) {
          setFixedLog(prev => [
            ...prev,
            ...data.fixed_pairs.map((p: { a: number; b: number; nameA: string; nameB: string }) =>
              `#${p.a} ${p.nameA} ↔ #${p.b} ${p.nameB}`
            )
          ])
        }

        setProgress({
          fixed: totalFixed,
          skipped_good: totalSkipped,
          errors: totalErrors,
          pairs_processed: totalProcessed,
          total_pairs: data.total_pairs,
        })

        if (!data.has_more) break
        cursor = data.next_cursor
      }
    } finally {
      setRunning(false)
      setActiveTarget(null)
      setDone(true)
      fetchStatus()
    }
  }

  if (!isOpen) return null

  const totalBad = participants.reduce((s, p) => s + p.bad_vibe_pairs, 0)

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-purple-500/30 rounded-2xl p-6 w-full max-w-2xl max-h-[88vh] flex flex-col gap-4 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-purple-400" />
            <h2 className="text-white font-bold text-lg">Fix Vibe Scores</h2>
            <span className="text-gray-500 text-sm bg-gray-800 px-2 py-0.5 rounded-full">Event {eventId}</span>
          </div>
          <button onClick={onClose} disabled={running} className="p-1.5 hover:bg-white/10 rounded-lg transition disabled:opacity-40">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Paid Only Toggle */}
        <div className="flex items-center gap-3 bg-gray-800/60 border border-gray-700/50 rounded-xl px-4 py-2.5 flex-shrink-0">
          <span className="text-sm text-gray-400">Filter:</span>
          <button
            onClick={() => setPaidOnly(v => !v)}
            disabled={running}
            className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium transition disabled:opacity-40 ${
              paidOnly ? 'bg-green-600/30 border border-green-500/50 text-green-300' : 'bg-gray-700 border border-gray-600 text-gray-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${paidOnly ? 'bg-green-400' : 'bg-gray-500'}`} />
            {paidOnly ? 'Paid Only' : 'All Eligible'}
          </button>
          <span className="text-xs text-gray-500">{paidOnly ? 'Only fixing pairs where both participants have paid' : 'Fixing all eligible participants regardless of payment'}</span>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <label className="flex items-center gap-2 cursor-pointer select-none" title="Skip pairs already cached with gpt-5.4-mini">
            <input
              type="checkbox"
              checked={skipNewModel}
              onChange={e => setSkipNewModel(e.target.checked)}
              disabled={running}
              className="w-3.5 h-3.5 accent-green-500"
            />
            <span className="text-sm text-gray-300">Skip already on <span className="text-green-400 font-mono">5.4-mini</span></span>
          </label>
        </div>

        {/* Summary bar */}
        <div className="flex items-center gap-3 bg-purple-900/20 border border-purple-500/20 rounded-xl px-4 py-3 flex-shrink-0">
          <div className="text-sm text-gray-300">
            <span className="font-bold text-white">{participants.length}</span> eligible
          </div>
          <div className="w-px h-4 bg-gray-700" />
          <div className="text-sm">
            <span className={`font-bold ${totalBad > 0 ? 'text-red-400' : 'text-green-400'}`}>{totalBad}</span>
            <span className="text-gray-400"> pairs with vibe≈10 (fallback)</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={fetchStatus}
              disabled={loading || running}
              className="p-1.5 hover:bg-white/10 rounded-lg transition disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => runFix(undefined, true)}
              disabled={running}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition"
              title="Recalculate ALL pairs, even ones that already have a good vibe score"
            >
              {running && activeTarget === 'all' ? '…' : 'Force Recalc All'}
            </button>
            <button
              onClick={() => runFix()}
              disabled={running || totalBad === 0}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition"
            >
              {running && activeTarget === 'all' ? 'Fixing All…' : 'Fix All'}
            </button>
          </div>
        </div>

        {/* Progress */}
        {progress && (
          <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl px-4 py-3 space-y-2 flex-shrink-0">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>
                {progress.total_pairs != null
                  ? `${progress.pairs_processed} / ${progress.total_pairs} pairs`
                  : `${progress.pairs_processed} pairs processed`}
              </span>
              {done && (
                <span className="text-green-400 flex items-center gap-1 font-medium">
                  <CheckCircle className="w-3 h-3" /> Done
                </span>
              )}
              {running && <span className="text-purple-400 animate-pulse text-xs">Running…</span>}
            </div>
            {progress.total_pairs != null && progress.total_pairs > 0 && (
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (progress.pairs_processed / progress.total_pairs) * 100)}%` }}
                />
              </div>
            )}
            <div className="flex gap-4 text-xs">
              <span className="text-green-400">Fixed: <b>{progress.fixed}</b></span>
              <span className="text-gray-400">Already ok: <b>{progress.skipped_good}</b></span>
              {progress.errors > 0 && <span className="text-red-400">Errors: <b>{progress.errors}</b></span>}
            </div>
          </div>
        )}

        {/* Fixed pairs log */}
        {fixedLog.length > 0 && (
          <div className="bg-gray-800/60 border border-green-500/20 rounded-xl px-3 py-2.5 flex-shrink-0 max-h-32 overflow-y-auto">
            <div className="text-xs text-green-400 font-semibold mb-1.5">Fixed {fixedLog.length} pair{fixedLog.length !== 1 ? 's' : ''}:</div>
            <div className="space-y-0.5">
              {fixedLog.map((entry, i) => (
                <div key={i} className="text-xs text-gray-300 font-mono">{entry}</div>
              ))}
            </div>
          </div>
        )}

        {/* Participant list */}
        <div className="overflow-y-auto flex-1 space-y-1.5 pr-1 min-h-0">
          {loading && (
            <div className="text-center text-gray-400 py-10 text-sm">Loading…</div>
          )}
          {!loading && participants.length === 0 && (
            <div className="text-center text-gray-400 py-10 text-sm">No eligible participants found for event {eventId}</div>
          )}
          {!loading && participants.map(p => (
            <div
              key={p.number}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-colors ${
                p.bad_vibe_pairs > 0
                  ? 'bg-red-900/10 border-red-500/20 hover:bg-red-900/15'
                  : 'bg-gray-800/30 border-gray-700/20'
              }`}
            >
              <User className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
              <span className="text-gray-500 text-xs w-5 flex-shrink-0">#{p.number}</span>
              <span className="text-white text-sm font-medium flex-1 truncate">{p.name}</span>
              <span className="text-gray-500 text-xs flex-shrink-0">{p.gender}</span>
              <div className="flex items-center gap-3 text-xs flex-shrink-0">
                <span className="text-gray-500">{p.cached_pairs} cached</span>
                {p.bad_vibe_pairs > 0 ? (
                  <span className="text-red-400 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {p.bad_vibe_pairs} bad
                  </span>
                ) : (
                  <span className="text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> ok
                  </span>
                )}
                {p.avg_vibe != null && (
                  <span className="text-gray-500 w-16 text-right">avg {p.avg_vibe}/25</span>
                )}
                {p.cached_pairs > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                    p.models.length === 0
                      ? 'bg-gray-700 text-gray-400'
                      : p.has_old_model
                        ? 'bg-orange-900/50 border border-orange-500/40 text-orange-300'
                        : 'bg-green-900/50 border border-green-500/40 text-green-300'
                  }`}>
                    {p.models.length === 0 ? 'no model' : p.has_old_model ? '⚠ old model' : '✓ 5.4-mini'}
                  </span>
                )}
              </div>
              <button
                onClick={() => runFix([p.number], true)}
                disabled={running}
                className="ml-1 px-2 py-1 bg-gray-600/70 hover:bg-gray-500 disabled:opacity-30 text-white text-xs font-medium rounded-lg transition flex-shrink-0"
                title="Force recalculate all pairs for this participant"
              >
                {running && Array.isArray(activeTarget) && activeTarget[0] === p.number ? '…' : 'Force'}
              </button>
              <button
                onClick={() => runFix([p.number])}
                disabled={running || p.bad_vibe_pairs === 0}
                className="ml-1 px-2.5 py-1 bg-indigo-600/70 hover:bg-indigo-600 disabled:opacity-30 text-white text-xs font-medium rounded-lg transition flex-shrink-0"
              >
                {running && Array.isArray(activeTarget) && activeTarget[0] === p.number ? '…' : 'Fix'}
              </button>
            </div>
          ))}
        </div>

        <p className="text-gray-600 text-xs flex-shrink-0 text-center">
          Only fixes pairs where ai_vibe_score ≈ 10 (OpenAI timeout fallback). Requires active OpenAI credit.
        </p>
      </div>
    </div>
  )
}
