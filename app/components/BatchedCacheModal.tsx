import { useEffect, useRef, useState } from "react"
import { X, Database, Play, Pause, RefreshCw, Activity, CheckCircle2, AlertTriangle, Square } from "lucide-react"

interface BatchedCacheModalProps {
  isOpen: boolean
  onClose: () => void
  eventId: number
}

type GenderMode = "same" | "opposite"

interface CacheStatus {
  participants_total: number
  eligible_pairs: number
  already_cached: number
  to_cache: number
  coverage_percent: number
}

interface RunStats {
  newly_cached: number
  already_cached: number
  skipped: number
  errors: number
  pairs_processed: number
}

interface BatchProgress {
  participants_completed: number
  participants_total: number
  has_more: boolean
  next_batch_start: number | null
}

interface SideState {
  status: CacheStatus | null
  statusLoading: boolean
  running: boolean
  paused: boolean
  cancelRequested: boolean
  batchSize: number
  cursor: number // next batch start
  runStats: RunStats
  progress: BatchProgress | null
  startedAt: number | null
  lastError: string | null
  finished: boolean
}

const initialSide = (): SideState => ({
  status: null,
  statusLoading: false,
  running: false,
  paused: false,
  cancelRequested: false,
  batchSize: 5,
  cursor: 0,
  runStats: { newly_cached: 0, already_cached: 0, skipped: 0, errors: 0, pairs_processed: 0 },
  progress: null,
  startedAt: null,
  lastError: null,
  finished: false,
})

function formatDuration(ms: number) {
  if (ms <= 0) return "0s"
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem}s`
}

export default function BatchedCacheModal({ isOpen, onClose, eventId }: BatchedCacheModalProps) {
  const [same, setSame] = useState<SideState>(initialSide())
  const [opposite, setOpposite] = useState<SideState>(initialSide())

  // Refs to read fresh state inside async loops (avoid stale closures)
  const sameRef = useRef(same)
  const oppositeRef = useRef(opposite)
  useEffect(() => { sameRef.current = same }, [same])
  useEffect(() => { oppositeRef.current = opposite }, [opposite])

  const setSide = (mode: GenderMode, updater: (prev: SideState) => SideState) => {
    if (mode === "same") setSame(updater)
    else setOpposite(updater)
  }

  const fetchStatus = async (mode: GenderMode) => {
    setSide(mode, (p) => ({ ...p, statusLoading: true, lastError: null }))
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cache-status-by-gender",
          eventId,
          genderMode: mode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to fetch status")
      setSide(mode, (p) => ({
        ...p,
        statusLoading: false,
        status: {
          participants_total: data.participants_total,
          eligible_pairs: data.eligible_pairs,
          already_cached: data.already_cached,
          to_cache: data.to_cache,
          coverage_percent: data.coverage_percent,
        },
      }))
    } catch (err: any) {
      setSide(mode, (p) => ({ ...p, statusLoading: false, lastError: err?.message || String(err) }))
    }
  }

  // Sequential batch driver for a single side. Reads cancel/pause flags from refs.
  const runBatches = async (mode: GenderMode) => {
    const getRef = () => (mode === "same" ? sameRef.current : oppositeRef.current)

    setSide(mode, (p) => ({
      ...p,
      running: true,
      paused: false,
      cancelRequested: false,
      finished: false,
      startedAt: Date.now(),
      lastError: null,
      runStats: { newly_cached: 0, already_cached: 0, skipped: 0, errors: 0, pairs_processed: 0 },
      cursor: 0,
    }))

    let nextStart = 0
    while (true) {
      const cur = getRef()
      if (cur.cancelRequested) break
      if (cur.paused) {
        // Wait while paused
        await new Promise((r) => setTimeout(r, 250))
        continue
      }

      const batchSize = Math.max(1, Math.min(cur.batchSize || 5, 50))
      try {
        const res = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cache-pairs-batched",
            eventId,
            genderMode: mode,
            batchStart: nextStart,
            batchSize,
            skipAI: false,
          }),
        })
        const data = await res.json()
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Batch failed at start=${nextStart}`)
        }

        const stats: RunStats = data.stats
        const progress: BatchProgress = data.progress

        setSide(mode, (p) => ({
          ...p,
          progress,
          cursor: progress.next_batch_start ?? progress.participants_total,
          runStats: {
            newly_cached: p.runStats.newly_cached + stats.newly_cached,
            already_cached: p.runStats.already_cached + stats.already_cached,
            skipped: p.runStats.skipped + stats.skipped,
            errors: p.runStats.errors + stats.errors,
            pairs_processed: p.runStats.pairs_processed + stats.pairs_processed,
          },
        }))

        if (!progress.has_more || progress.next_batch_start == null) break
        nextStart = progress.next_batch_start

        // Small breather between batches so the system isn't slammed
        await new Promise((r) => setTimeout(r, 150))
      } catch (err: any) {
        setSide(mode, (p) => ({ ...p, lastError: err?.message || String(err) }))
        break
      }
    }

    setSide(mode, (p) => ({ ...p, running: false, finished: !p.cancelRequested }))
    // Refresh status to reflect new cache coverage
    await fetchStatus(mode)
  }

  const onStart = (mode: GenderMode) => {
    if (!eventId) return
    runBatches(mode)
  }

  const onPause = (mode: GenderMode) => {
    setSide(mode, (p) => ({ ...p, paused: true }))
  }

  const onResume = (mode: GenderMode) => {
    setSide(mode, (p) => ({ ...p, paused: false }))
  }

  const onStop = (mode: GenderMode) => {
    setSide(mode, (p) => ({ ...p, cancelRequested: true, paused: false }))
  }

  // Auto-fetch status when modal opens or event changes
  useEffect(() => {
    if (!isOpen || !eventId) return
    fetchStatus("same")
    fetchStatus("opposite")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, eventId])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-600/30 border border-indigo-400/30">
              <Database className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Batched Pre-Cache (by Round)</h2>
              <p className="text-xs text-white/60">
                Caches same-gender (R1) and opposite-gender (R2) pairs in small participant batches.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <SideCard
            title="نفس الجنس (R1)"
            subtitle="Same-gender pairs"
            accent="from-cyan-600/30 to-blue-700/20 border-cyan-400/30"
            mode="same"
            state={same}
            onStart={onStart}
            onPause={onPause}
            onResume={onResume}
            onStop={onStop}
            onRefreshStatus={fetchStatus}
            onBatchSizeChange={(v) => setSame((p) => ({ ...p, batchSize: v }))}
          />
          <SideCard
            title="الجنس الآخر (R2)"
            subtitle="Opposite-gender pairs"
            accent="from-rose-600/30 to-orange-600/20 border-rose-400/30"
            mode="opposite"
            state={opposite}
            onStart={onStart}
            onPause={onPause}
            onResume={onResume}
            onStop={onStop}
            onRefreshStatus={fetchStatus}
            onBatchSizeChange={(v) => setOpposite((p) => ({ ...p, batchSize: v }))}
          />
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-3 border-t border-white/10 bg-white/5 text-xs text-white/60">
          Each batch processes a slice of participants (default 5) and all of their cross-pairs against the
          rest of the pool. Pairs are deduplicated across batches by index. Click <b>Refresh</b> to re-check
          coverage after running.
        </div>
      </div>
    </div>
  )
}

function SideCard({
  title,
  subtitle,
  accent,
  mode,
  state,
  onStart,
  onPause,
  onResume,
  onStop,
  onRefreshStatus,
  onBatchSizeChange,
}: {
  title: string
  subtitle: string
  accent: string
  mode: GenderMode
  state: SideState
  onStart: (m: GenderMode) => void
  onPause: (m: GenderMode) => void
  onResume: (m: GenderMode) => void
  onStop: (m: GenderMode) => void
  onRefreshStatus: (m: GenderMode) => void
  onBatchSizeChange: (v: number) => void
}) {
  const elapsed = state.startedAt ? Date.now() - state.startedAt : 0
  const totalP = state.status?.participants_total ?? 0
  const completed = state.progress?.participants_completed ?? 0
  const pct = totalP > 0 ? Math.min(100, Math.round((completed / totalP) * 100)) : 0
  const coverage = state.status?.coverage_percent ?? 0

  return (
    <div className={`rounded-xl border bg-gradient-to-br ${accent} p-4 flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-bold text-white">{title}</div>
          <div className="text-xs text-white/70">{subtitle}</div>
        </div>
        <button
          onClick={() => onRefreshStatus(mode)}
          disabled={state.statusLoading || state.running}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white/80 text-xs disabled:opacity-50"
          title="Refresh coverage status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${state.statusLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Status Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Participants" value={state.status?.participants_total ?? "—"} />
        <Stat label="Eligible Pairs" value={state.status?.eligible_pairs ?? "—"} />
        <Stat label="Already Cached" value={state.status?.already_cached ?? "—"} tone="ok" />
        <Stat label="To Cache" value={state.status?.to_cache ?? "—"} tone="warn" />
      </div>

      {/* Coverage bar */}
      <div>
        <div className="flex items-center justify-between text-[11px] text-white/70 mb-1">
          <span>Cache Coverage</span>
          <span className="font-semibold text-white">{coverage}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-green-500"
            style={{ width: `${coverage}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mt-1">
        <label className="flex items-center gap-1 text-xs text-white/80">
          Batch:
          <input
            type="number"
            value={state.batchSize}
            min={1}
            max={50}
            disabled={state.running}
            onChange={(e) => {
              const v = Math.max(1, Math.min(50, parseInt(e.target.value) || 5))
              onBatchSizeChange(v)
            }}
            className="w-14 px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white text-xs"
          />
        </label>

        {!state.running && (
          <button
            onClick={() => onStart(mode)}
            disabled={!state.status || state.status.eligible_pairs === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/30 text-xs disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {state.finished ? "Run Again" : "Start"}
          </button>
        )}

        {state.running && !state.paused && (
          <button
            onClick={() => onPause(mode)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-500/20 border border-amber-400/30 text-amber-200 hover:bg-amber-500/30 text-xs"
          >
            <Pause className="w-3.5 h-3.5" />
            Pause
          </button>
        )}

        {state.running && state.paused && (
          <button
            onClick={() => onResume(mode)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-cyan-500/20 border border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/30 text-xs"
          >
            <Play className="w-3.5 h-3.5" />
            Resume
          </button>
        )}

        {state.running && (
          <button
            onClick={() => onStop(mode)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-rose-500/20 border border-rose-400/30 text-rose-200 hover:bg-rose-500/30 text-xs"
          >
            <Square className="w-3.5 h-3.5" />
            Stop
          </button>
        )}
      </div>

      {/* Progress */}
      {(state.running || state.finished || state.progress) && (
        <div className="mt-1">
          <div className="flex items-center justify-between text-[11px] text-white/70 mb-1">
            <span>
              Batch progress: {completed} / {totalP} participants
            </span>
            <span className="font-semibold text-white">{pct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full ${state.running ? "bg-gradient-to-r from-indigo-400 to-violet-500 animate-pulse" : "bg-gradient-to-r from-indigo-400 to-violet-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Run stats */}
      {(state.running || state.finished || state.runStats.pairs_processed > 0) && (
        <div className="grid grid-cols-2 gap-2 text-[11px] mt-1">
          <Stat label="Newly Cached" value={state.runStats.newly_cached} tone="ok" small />
          <Stat label="Cache Hits" value={state.runStats.already_cached} small />
          <Stat label="Skipped" value={state.runStats.skipped} small />
          <Stat label="Errors" value={state.runStats.errors} tone={state.runStats.errors > 0 ? "err" : undefined} small />
          <Stat label="Pairs Processed" value={state.runStats.pairs_processed} small />
          <Stat label="Elapsed" value={formatDuration(elapsed)} small />
        </div>
      )}

      {/* Status badges */}
      {state.finished && !state.lastError && (
        <div className="inline-flex items-center gap-1 text-xs text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" /> Completed
        </div>
      )}
      {state.lastError && (
        <div className="inline-flex items-start gap-1 text-xs text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
          <span className="break-all">{state.lastError}</span>
        </div>
      )}
      {state.running && (
        <div className="inline-flex items-center gap-1 text-xs text-indigo-300">
          <Activity className="w-3.5 h-3.5 animate-pulse" />
          {state.paused ? "Paused" : "Running…"}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone, small }: { label: string; value: number | string; tone?: "ok" | "warn" | "err"; small?: boolean }) {
  const toneCls =
    tone === "ok" ? "text-emerald-300"
      : tone === "warn" ? "text-amber-300"
      : tone === "err" ? "text-rose-300"
      : "text-white"
  return (
    <div className={`px-2 py-1.5 rounded-md bg-white/5 border border-white/10 ${small ? "" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className={`font-bold ${toneCls} ${small ? "text-sm" : "text-base"}`}>{value}</div>
    </div>
  )
}
