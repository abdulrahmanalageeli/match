import { useEffect, useRef, useState } from "react"
import { Activity, RefreshCw, Zap } from "lucide-react"

type QueueStatus = {
  pending: number
  processing: number
  completed: number
  failed: number
  obsolete: number
  completed_last_minute: number
  retrying: number
  priority_event_id: number | null
  max_in_flight: number
  dispatch_seconds: number
}

export default function AiQueueStatus({ eventId }: { eventId: number }) {
  const [queue, setQueue] = useState<QueueStatus | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const priorityController = useRef<AbortController | null>(null)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    setQueue(null)
    setError("")
    setBusy(false)
    async function refresh() {
      try {
        const response = await fetch("/api/admin/trigger-match", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ai-queue-status", eventId }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok || !data?.queue) throw new Error(data?.error || "Unable to load AI progress.")
        if (active) { setQueue(data.queue); setError("") }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load AI progress.")
      } finally {
        if (active) timer = setTimeout(refresh, 10_000)
      }
    }
    void refresh()
    return () => {
      active = false
      controller.abort()
      priorityController.current?.abort()
      clearTimeout(timer)
    }
  }, [eventId, revision])

  async function prioritize() {
    const controller = new AbortController()
    priorityController.current = controller
    setBusy(true)
    try {
      const response = await fetch("/api/admin/trigger-match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ai-queue-prioritize", eventId }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.queue) throw new Error(data?.error || "Could not prioritize this event.")
      if (!controller.signal.aborted) { setQueue(data.queue); setError("") }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not prioritize this event.")
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  const total = queue ? queue.completed + queue.pending + queue.processing + queue.failed : 0
  const percent = total > 0 && queue ? Math.round(queue.completed / total * 100) : 0
  const remaining = queue ? queue.pending + queue.processing : 0

  return (
    <section aria-label="AI queue" className="w-full rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-4 text-sm text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-white"><Activity className="h-4 w-4 text-indigo-300" /> AI Queue · Event {eventId}</h3>
          <p className="mt-1 text-xs text-slate-400">AI jobs from this event’s batch cache, including its wider participant pool.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={prioritize} disabled={busy || !queue || queue.priority_event_id === eventId}
            className="flex min-h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            <Zap className="h-3.5 w-3.5" />{busy ? "Prioritizing…" : queue?.priority_event_id === eventId ? "Event prioritized" : "Prioritize this event"}
          </button>
          <button type="button" aria-label="Refresh AI queue" onClick={() => setRevision(value => value + 1)}
            className="min-h-9 rounded-lg border border-white/15 px-3 hover:bg-white/10"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-amber-300">{error} {queue ? "Displayed counts may be out of date." : ""}</p>}
      {queue ? <>
        <div className="my-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["Completed", queue.completed], ["Waiting", queue.pending], ["Running", queue.processing], ["Failed", queue.failed]].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-black/15 px-3 py-2"><div className="text-xs text-slate-400">{label}</div><div className="text-lg font-semibold text-white">{Number(value).toLocaleString()}</div></div>
          ))}
        </div>
        {total > 0 && <div role="progressbar" aria-label="AI scoring completed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-indigo-400 transition-all" style={{ width: `${percent}%` }} /></div>}
        <p className="mt-2 text-xs text-slate-300" role="status">
          {remaining > 0 ? `${percent}% complete · ${queue.completed_last_minute} completed in the last minute${queue.retrying ? ` · ${queue.retrying} retrying with backoff` : ""}`
            : queue.failed > 0 ? "Some AI jobs failed. AI scoring is incomplete and needs attention."
            : total > 0 ? "Queued AI work is complete. You can generate matches; any uncached pairs may still need scoring."
            : "No AI jobs queued. Run Batched Compatibility Cache to prepare scores."}
        </p>
        <p className="mt-2 text-xs text-slate-400">Checks for work every {queue.dispatch_seconds}s · Up to {queue.max_in_flight} AI jobs running across all events. {queue.priority_event_id && queue.priority_event_id !== eventId ? `Event ${queue.priority_event_id} currently has priority.` : ""} Progress refreshes automatically.</p>
      </> : !error && <p role="status" className="mt-3 text-xs text-slate-400">Loading AI progress…</p>}
    </section>
  )
}
