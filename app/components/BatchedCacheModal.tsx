import { useEffect, useRef, useState } from "react"
import { X, Database, Play, Pause, RefreshCw, Activity, CheckCircle2, AlertTriangle, Square } from "lucide-react"

interface BatchedCacheModalProps {
  isOpen: boolean
  onClose: () => void
  eventId: number
}

type GenderMode = "preference"

interface CacheStatus {
  participants_total: number
  eligible_pairs: number
  already_cached: number
  pending_ai: number
  to_cache: number
  coverage_percent: number
}

interface RunStats {
  newly_cached: number
  already_cached: number
  skipped: number
  errors: number
  pairs_processed: number
  queued_ai_count?: number
  failures?: Array<{ participant_a_number?: number; participant_b_number?: number; reason?: string }>
}

interface BatchProgress {
  participants_completed: number
  participants_total: number
  has_more: boolean
  next_batch_start: number | null
  resume_cursor?: { i: number; j: number } | null
}

const MAX_BATCH_ATTEMPTS = 5
const MAX_AI_CACHES_PER_REQUEST = 12
const MAX_LOCAL_CACHES_PER_REQUEST = 500
const BATCH_REQUEST_TIMEOUT_MS = 45_000

class RetryableBatchError extends Error {}
class CacheCheckpointResetError extends Error {}

interface FullCacheCheckpoint {
  version: 1
  eventId: number
  mode: GenderMode
  checkpointId: string | null
  nextStart: number
  resumeCursor: { i: number; j: number } | null
  runStats: RunStats
  progress: BatchProgress | null
  coverageRepairAttempts: number
  metadataRetryAttempts: number
  startedAt: number
}

const emptyRunStats = (): RunStats => ({
  newly_cached: 0,
  already_cached: 0,
  skipped: 0,
  errors: 0,
  pairs_processed: 0,
  queued_ai_count: 0,
})

const fullCacheCheckpointKey = (eventId: number, mode: GenderMode) => `admin-cache-progress:v1:full:${eventId}:${mode}`

function readFullCacheCheckpoint(eventId: number, mode: GenderMode): FullCacheCheckpoint | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(fullCacheCheckpointKey(eventId, mode)) || "null")
    return parsed?.version === 1 && parsed?.eventId === eventId && parsed?.mode === mode ? parsed : null
  } catch {
    return null
  }
}

function writeFullCacheCheckpoint(checkpoint: FullCacheCheckpoint) {
  try {
    window.localStorage.setItem(fullCacheCheckpointKey(checkpoint.eventId, checkpoint.mode), JSON.stringify(checkpoint))
  } catch {}
}

function clearFullCacheCheckpoint(eventId: number, mode: GenderMode) {
  try {
    window.localStorage.removeItem(fullCacheCheckpointKey(eventId, mode))
  } catch {}
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

function batchRetryDelayMs(attempt: number) {
  return Math.min(12_000, 1_500 * (2 ** Math.max(0, attempt - 1)))
}

function isRetryableHttpStatus(status: number) {
  return [408, 409, 425, 429].includes(status) || status >= 500
}

function isRetryableBatchError(error: unknown) {
  if (error instanceof RetryableBatchError) return true
  if (error instanceof DOMException && error.name === "AbortError") return true
  const message = error instanceof Error ? error.message : String(error || "")
  return /abort|network|fetch failed|timed? out|temporar|rate.?limit|connection|HTTP 5\d\d/i.test(message)
}

async function readJsonResponse(res: Response) {
  const raw = await res.text()
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    const msg = raw?.trim() || `Non-JSON response (HTTP ${res.status})`
    throw new Error(msg)
  }
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
  retryMessage: string | null
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
  runStats: emptyRunStats(),
  progress: null,
  startedAt: null,
  lastError: null,
  retryMessage: null,
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
  const [preference, setPreference] = useState<SideState>(initialSide())

  // Refs to read fresh state inside async loops (avoid stale closures)
  const preferenceRef = useRef(preference)
  useEffect(() => { preferenceRef.current = preference }, [preference])

  const setSide = (_mode: GenderMode, updater: (prev: SideState) => SideState) => setPreference(updater)

  const fetchStatus = async (
    mode: GenderMode,
    { preserveError = false }: { preserveError?: boolean } = {},
  ) => {
    setSide(mode, (p) => ({
      ...p,
      statusLoading: true,
      lastError: preserveError ? p.lastError : null,
    }))
    try {
      let nextStart = 0
      let resumeCursor: { i: number; j: number } | null = null
      let participantsTotal: number | null = null
      let eligiblePairsTotal = 0
      let alreadyCachedTotal = 0
      let pendingAiTotal = 0

      while (true) {
        const res = await fetch("/api/admin/trigger-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cache-status-by-gender-batched",
            eventId,
            genderMode: mode,
            batchStart: nextStart,
            batchSize: 10,
            resumeCursor,
            maxDurationMs: 3500,
            maxPairsPerRequest: 20000,
          }),
        })

        const data = await readJsonResponse(res)
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Failed to fetch status")
        }

        const stats = data.stats as { eligible_pairs: number; already_cached: number; pending_ai?: number }
        const progress = data.progress as BatchProgress

        if (participantsTotal == null) participantsTotal = progress.participants_total
        eligiblePairsTotal += stats.eligible_pairs || 0
        alreadyCachedTotal += stats.already_cached || 0
        pendingAiTotal += stats.pending_ai || 0

        resumeCursor = progress.resume_cursor ?? null

        if (!progress.has_more || progress.next_batch_start == null) break

        if (progress.next_batch_start !== nextStart) {
          nextStart = progress.next_batch_start
          resumeCursor = null
        }

        await new Promise((r) => setTimeout(r, 50))
      }

      const participants_total = participantsTotal ?? 0
      const eligible_pairs = eligiblePairsTotal
      const already_cached = alreadyCachedTotal
      const to_cache = Math.max(0, eligible_pairs - already_cached)
      const coverage_percent = eligible_pairs > 0 ? Math.round((already_cached / eligible_pairs) * 100) : 100

      setSide(mode, (p) => ({
        ...p,
        statusLoading: false,
        status: {
          participants_total,
          eligible_pairs,
          already_cached,
          pending_ai: pendingAiTotal,
          to_cache,
          coverage_percent,
        },
      }))
    } catch (err: any) {
      setSide(mode, (p) => ({ ...p, statusLoading: false, lastError: err?.message || String(err) }))
    }
  }

  // Sequential batch driver for a single side. Reads cancel/pause flags from refs.
  const runBatches = async (mode: GenderMode) => {
    const getRef = () => preferenceRef.current
    const savedCheckpoint = readFullCacheCheckpoint(eventId, mode)
    let runStatsTotals = savedCheckpoint?.runStats || emptyRunStats()
    const runStartedAt = savedCheckpoint?.startedAt || Date.now()

    setSide(mode, (p) => ({
      ...p,
      running: true,
      paused: false,
      cancelRequested: false,
      finished: false,
      startedAt: runStartedAt,
      lastError: null,
      retryMessage: savedCheckpoint ? "Resuming from the last acknowledged cache checkpoint…" : null,
      runStats: runStatsTotals,
      progress: savedCheckpoint?.progress || null,
      cursor: savedCheckpoint?.nextStart || 0,
    }))

    let nextStart = savedCheckpoint?.nextStart || 0
    let resumeCursor: { i: number; j: number } | null = savedCheckpoint?.resumeCursor || null
    let checkpointId = savedCheckpoint?.checkpointId || null
    let cumulativeErrors = 0
    let coverageRepairAttempts = savedCheckpoint?.coverageRepairAttempts || 0
    let metadataRetryAttempts = savedCheckpoint?.metadataRetryAttempts || 0
    let lastAcknowledgedProgress = savedCheckpoint?.progress || null
    let runError: string | null = null
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
        // A timed-out response may still have committed some upserts. Retrying
        // the exact same cursor is safe: cache rows use an immutable unique key,
        // so completed pairs become hits and only the missing pair work repeats.
        const requestStart = nextStart
        const requestResumeCursor = resumeCursor ? { ...resumeCursor } : null
        const runStatsBeforeRequest = { ...runStatsTotals }
        let data: any = null
        let recoveredNewlyCached = 0

        // Persist the request boundary before starting network work. Refreshing
        // during an in-flight request resumes at this exact boundary; any rows
        // already committed by the server are then exact hits, not recalculated.
        writeFullCacheCheckpoint({
          version: 1,
          eventId,
          mode,
          checkpointId,
          nextStart: requestStart,
          resumeCursor: requestResumeCursor,
          runStats: runStatsBeforeRequest,
          progress: lastAcknowledgedProgress,
          coverageRepairAttempts,
          metadataRetryAttempts,
          startedAt: runStartedAt,
        })

        for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
          const batchController = new AbortController()
          const batchTimeout = window.setTimeout(() => batchController.abort(), BATCH_REQUEST_TIMEOUT_MS)
          try {
            const res = await fetch("/api/admin/trigger-match", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: batchController.signal,
              body: JSON.stringify({
                action: "cache-pairs-batched",
                eventId,
                genderMode: mode,
                batchStart: requestStart,
                batchSize,
                resumeCursor: requestResumeCursor,
                skipAI: false,
                deferAIEnrichment: true,
                maxAICachesPerRequest: MAX_AI_CACHES_PER_REQUEST,
                maxLocalCachesPerRequest: MAX_LOCAL_CACHES_PER_REQUEST,
                maxPairsPerRequest: 20000,
                priorErrors: cumulativeErrors,
                checkpointId,
              }),
            })
            let attemptData: any
            try {
              attemptData = await readJsonResponse(res)
            } catch (error) {
              if (isRetryableHttpStatus(res.status)) {
                throw new RetryableBatchError(error instanceof Error ? error.message : String(error))
              }
              throw error
            }
            if (attemptData?.reset_checkpoint === true || attemptData?.code === "CACHE_CHECKPOINT_STALE") {
              throw new CacheCheckpointResetError(attemptData?.error || "Cache checkpoint is stale")
            }
            if (!res.ok || !attemptData?.success) {
              const message = attemptData?.error || `Batch failed with HTTP ${res.status} at start=${requestStart}`
              if (isRetryableHttpStatus(res.status)) throw new RetryableBatchError(message)
              throw new Error(message)
            }

            const attemptErrors = Number(attemptData?.stats?.errors) || 0
            if (attemptErrors === 0 || attempt === MAX_BATCH_ATTEMPTS) {
              data = attemptData
              break
            }

            recoveredNewlyCached += Number(attemptData?.stats?.newly_cached) || 0
            const firstFailure = Array.isArray(attemptData?.stats?.failures)
              ? attemptData.stats.failures[0]
              : null
            const pairLabel = firstFailure?.participant_a_number != null && firstFailure?.participant_b_number != null
              ? ` for pair #${firstFailure.participant_a_number} × #${firstFailure.participant_b_number}`
              : ""
            const delay = batchRetryDelayMs(attempt)
            setSide(mode, (p) => ({
              ...p,
              lastError: null,
              retryMessage: `A pair failed${pairLabel}. Retrying the same checkpoint (${attempt}/${MAX_BATCH_ATTEMPTS - 1}) in ${Math.ceil(delay / 1000)}s…`,
            }))
            await wait(delay)
          } catch (error) {
            if (!isRetryableBatchError(error) || attempt === MAX_BATCH_ATTEMPTS) throw error
            const delay = batchRetryDelayMs(attempt)
            setSide(mode, (p) => ({
              ...p,
              lastError: null,
              retryMessage: `Temporary batch failure. Retrying the same checkpoint (${attempt}/${MAX_BATCH_ATTEMPTS - 1}) in ${Math.ceil(delay / 1000)}s…`,
            }))
            await wait(delay)
          } finally {
            window.clearTimeout(batchTimeout)
          }
        }

        if (!data) throw new Error(`Batch failed at start=${requestStart}`)

        const responseStats: RunStats = data.stats
        const stats: RunStats = {
          ...responseStats,
          // Successful rows from an earlier failed attempt appear as hits when
          // the same window is retried. Keep the displayed counters truthful.
          newly_cached: responseStats.newly_cached + recoveredNewlyCached,
          already_cached: Math.max(0, responseStats.already_cached - recoveredNewlyCached),
        }
        const progress: BatchProgress = data.progress
        checkpointId = data.checkpoint_id || checkpointId
        cumulativeErrors += stats.errors || 0
        runStatsTotals = {
          newly_cached: runStatsTotals.newly_cached + stats.newly_cached,
          already_cached: runStatsTotals.already_cached + stats.already_cached,
          skipped: runStatsTotals.skipped + stats.skipped,
          errors: runStatsTotals.errors + stats.errors,
          pairs_processed: runStatsTotals.pairs_processed + stats.pairs_processed,
          queued_ai_count: (runStatsTotals.queued_ai_count || 0) + (stats.queued_ai_count || 0),
        }

        setSide(mode, (p) => ({
          ...p,
          retryMessage: null,
          progress,
          cursor: progress.next_batch_start ?? progress.participants_total,
          runStats: runStatsTotals,
        }))

        resumeCursor = progress.resume_cursor ?? null

        if (stats.errors > 0) {
          writeFullCacheCheckpoint({
            version: 1,
            eventId,
            mode,
            checkpointId,
            nextStart: requestStart,
            resumeCursor: requestResumeCursor,
            runStats: runStatsBeforeRequest,
            progress: lastAcknowledgedProgress,
            coverageRepairAttempts,
            metadataRetryAttempts,
            startedAt: runStartedAt,
          })
          const firstFailure = Array.isArray(stats.failures) ? stats.failures[0] : null
          const pairLabel = firstFailure?.participant_a_number != null && firstFailure?.participant_b_number != null
            ? ` Pair #${firstFailure.participant_a_number} × #${firstFailure.participant_b_number}: ${firstFailure.reason || "unknown error"}.`
            : ""
          runError = `Pre-cache stopped after ${cumulativeErrors} pair failure${cumulativeErrors === 1 ? "" : "s"}.${pairLabel} Cache freshness was not advanced; run it again to retry.`
          setSide(mode, (p) => ({ ...p, lastError: runError }))
          break
        }

        lastAcknowledgedProgress = progress

        const missingCoverage = Number(data?.coverage_verification?.missingCount) || 0
        const pendingAiCoverage = Number(data?.coverage_verification?.pendingAiCount) || 0
        if (!progress.has_more && data.metadata_updated === false && missingCoverage > 0 && coverageRepairAttempts < 3) {
          coverageRepairAttempts++
          nextStart = 0
          resumeCursor = null
          writeFullCacheCheckpoint({
            version: 1, eventId, mode, checkpointId, nextStart, resumeCursor,
            runStats: runStatsTotals,
            progress: { ...progress, has_more: true, next_batch_start: 0, resume_cursor: null },
            coverageRepairAttempts, metadataRetryAttempts,
            startedAt: runStartedAt,
          })
          setSide(mode, (p) => ({
            ...p,
            retryMessage: `Final check found ${missingCoverage} missing cache pair${missingCoverage === 1 ? "" : "s"}. Running repair pass ${coverageRepairAttempts}/3…`,
          }))
          await wait(500)
          continue
        }

        if (!progress.has_more && missingCoverage === 0 && pendingAiCoverage > 0) {
          clearFullCacheCheckpoint(eventId, mode)
          setSide(mode, (p) => ({
            ...p,
            retryMessage: `Local scoring is complete. ${pendingAiCoverage} pair${pendingAiCoverage === 1 ? " is" : "s are"} queued for required AI chemistry; background workers will finalize them without rescanning completed pairs.`,
          }))
          break
        }

        if (!progress.has_more && data.metadata_updated === false && missingCoverage === 0 && metadataRetryAttempts < 3) {
          metadataRetryAttempts++
          nextStart = requestStart
          resumeCursor = requestResumeCursor
          writeFullCacheCheckpoint({
            version: 1, eventId, mode, checkpointId, nextStart, resumeCursor,
            runStats: runStatsTotals,
            progress: { ...progress, has_more: true, next_batch_start: requestStart, resume_cursor: requestResumeCursor },
            coverageRepairAttempts, metadataRetryAttempts,
            startedAt: runStartedAt,
          })
          setSide(mode, (p) => ({
            ...p,
            retryMessage: `Cache rows are complete; retrying freshness metadata ${metadataRetryAttempts}/3…`,
          }))
          await wait(batchRetryDelayMs(metadataRetryAttempts))
          continue
        }

        if (!progress.has_more && data.metadata_updated === false) {
          runError = data.metadata_error || "Caching finished, but cache freshness metadata could not be updated."
          setSide(mode, (p) => ({ ...p, lastError: runError }))
          break
        }

        if (!progress.has_more || progress.next_batch_start == null) {
          clearFullCacheCheckpoint(eventId, mode)
          break
        }

        if (progress.next_batch_start !== nextStart) {
          nextStart = progress.next_batch_start
          resumeCursor = null
        }

        writeFullCacheCheckpoint({
          version: 1, eventId, mode, checkpointId, nextStart, resumeCursor,
          runStats: runStatsTotals, progress, coverageRepairAttempts, metadataRetryAttempts,
          startedAt: runStartedAt,
        })

        // Small breather between batches so the system isn't slammed
        await new Promise((r) => setTimeout(r, 150))
      } catch (err: any) {
        if (err instanceof CacheCheckpointResetError) {
          clearFullCacheCheckpoint(eventId, mode)
          nextStart = 0
          resumeCursor = null
          checkpointId = null
          cumulativeErrors = 0
          coverageRepairAttempts = 0
          metadataRetryAttempts = 0
          lastAcknowledgedProgress = null
          runStatsTotals = emptyRunStats()
          setSide(mode, (p) => ({
            ...p,
            progress: null,
            cursor: 0,
            runStats: runStatsTotals,
            lastError: null,
            retryMessage: "Roster or score inputs changed; restarting safely from the beginning…",
          }))
          continue
        }
        runError = err?.message || String(err)
        setSide(mode, (p) => ({ ...p, retryMessage: null, lastError: runError }))
        break
      }
    }

    setSide(mode, (p) => ({ ...p, running: false, finished: !p.cancelRequested && !runError }))
    // Refresh status to reflect new cache coverage
    await fetchStatus(mode, { preserveError: Boolean(runError) })
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
    const checkpoint = readFullCacheCheckpoint(eventId, "preference")
    if (checkpoint) {
      setPreference((previous) => ({
        ...previous,
        cursor: checkpoint.nextStart,
        runStats: checkpoint.runStats,
        progress: checkpoint.progress,
        startedAt: checkpoint.startedAt,
        finished: false,
        retryMessage: "Saved progressive checkpoint found. Start to resume without rescanning acknowledged pairs.",
      }))
    }
    fetchStatus("preference")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, eventId])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-600/30 border border-indigo-400/30">
              <Database className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Batched Pre-Cache</h2>
              <p className="text-xs text-white/60">
                Fast v12 cache for mutual preferences; required AI chemistry finalizes in the background.
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
        <div className="flex-1 overflow-y-auto p-4">
          <SideCard
            title="حسب التفضيلات"
            subtitle="Mutual gender preferences (recommended)"
            accent="from-emerald-600/30 to-teal-700/20 border-emerald-400/30"
            mode="preference"
            state={preference}
            onStart={onStart}
            onPause={onPause}
            onResume={onResume}
            onStop={onStop}
            onRefreshStatus={fetchStatus}
            onBatchSizeChange={(v) => setPreference((p) => ({ ...p, batchSize: v }))}
          />
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-3 border-t border-white/10 bg-white/5 text-xs text-white/60">
          Only the global mutual-preference sweep runs. Each request can persist 500 deterministic rows in
          250-row writes; required AI chemistry is queued separately in durable 12-job background lanes.
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
        <Stat label="Awaiting AI" value={state.status?.pending_ai ?? "—"} tone="warn" />
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
            {state.finished ? "Run Again" : state.progress?.has_more ? "Resume" : "Start"}
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
          <Stat label="Pairs Scanned" value={state.runStats.pairs_processed} small />
          <Stat label="AI Queued" value={state.runStats.queued_ai_count || 0} small />
          <Stat label="Elapsed" value={formatDuration(elapsed)} small />
        </div>
      )}

      {/* Status badges */}
      {state.finished && !state.lastError && (
        <div className="inline-flex items-center gap-1 text-xs text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" /> {state.status?.pending_ai ? "Local pass complete; AI pending" : "Completed"}
        </div>
      )}
      {state.lastError && (
        <div className="inline-flex items-start gap-1 text-xs text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
          <span className="break-all">{state.lastError}</span>
        </div>
      )}
      {state.retryMessage && (
        <div className="inline-flex items-start gap-1 text-xs text-amber-200">
          <RefreshCw className="w-3.5 h-3.5 mt-0.5 animate-spin" />
          <span>{state.retryMessage}</span>
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
