import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Activity, CakeSlice, Clock3, EyeOff, RefreshCw, UserRound, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminFetch as fetch } from '~/lib/admin-fetch.mjs'

type SurveyProgressParticipant = {
  participant_id: string
  assigned_number: number
  name: string | null
  event_id: number | null
  current_page: number
  total_pages: number
  answered_questions: number
  total_questions: number
  progress_percent: number
  gender: 'male' | 'female' | null
  gender_revealed: boolean
  age: number | null
  age_revealed: boolean
  started_at: string
  last_seen_at: string
}

type RecentSurveyCompletion = {
  completion_key: string
  participant_id: string
  assigned_number: number
  name: string | null
  event_id: number | null
  completed_at: string
}

function elapsedLabel(startedAt: string, nowMs: number) {
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - Date.parse(startedAt)) / 1000))
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 60) return 'أقل من دقيقة'
  const minutes = Math.floor(elapsedSeconds / 60)
  if (minutes < 60) return `${minutes} د`
  const hours = Math.floor(minutes / 60)
  return `${hours} س ${minutes % 60} د`
}

function progressStatus(progress: number) {
  if (progress >= 100) return { label: 'بانتظار الإرسال', color: 'text-emerald-200', bg: 'border-emerald-400/25 bg-emerald-400/10' }
  if (progress >= 75) return { label: 'قريب يخلص', color: 'text-emerald-200', bg: 'border-emerald-400/25 bg-emerald-400/10' }
  if (progress >= 40) return { label: 'متقدم', color: 'text-cyan-200', bg: 'border-cyan-400/25 bg-cyan-400/10' }
  return { label: 'في البداية', color: 'text-amber-200', bg: 'border-amber-400/25 bg-amber-400/10' }
}

export default function SurveyProgressTracker({
  enabled = true,
  currentEventId,
  onUnauthorized,
}: {
  enabled?: boolean
  currentEventId: number
  onUnauthorized?: () => void
}) {
  const [participants, setParticipants] = useState<SurveyProgressParticipant[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverNow, setServerNow] = useState(Date.now())
  const requestInFlightRef = useRef(false)
  const onUnauthorizedRef = useRef(onUnauthorized)
  const hasLoadedRef = useRef(false)
  const previousActiveIdsRef = useRef<Set<string>>(new Set())
  const seenCompletionKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  const loadProgress = useCallback(async () => {
    if (!enabled || requestInFlightRef.current) return
    requestInFlightRef.current = true
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-live-survey-progress' }),
      })
      if (response.status === 401) {
        onUnauthorizedRef.current?.()
        return
      }
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل التقدم المباشر')
      const nextParticipants: SurveyProgressParticipant[] = Array.isArray(data.participants) ? data.participants : []
      const recentCompletions: RecentSurveyCompletion[] = Array.isArray(data.recent_completions) ? data.recent_completions : []
      const previousActiveIds = previousActiveIdsRef.current

      for (const completion of recentCompletions) {
        if (seenCompletionKeysRef.current.has(completion.completion_key)) continue
        seenCompletionKeysRef.current.add(completion.completion_key)
        if (hasLoadedRef.current && previousActiveIds.has(completion.participant_id)) {
          const participantLabel = completion.name || `Participant #${completion.assigned_number}`
          toast.success(`${participantLabel} completed the survey`, {
            duration: 4_500,
            icon: '✓',
          })
        }
      }

      previousActiveIdsRef.current = new Set(nextParticipants.map(participant => participant.participant_id))
      hasLoadedRef.current = true
      setParticipants(nextParticipants)
      setServerNow(Date.parse(data.server_time) || Date.now())
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل التقدم المباشر')
    } finally {
      requestInFlightRef.current = false
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    void loadProgress()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadProgress()
    }, 3_000)
    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') void loadProgress()
    }
    document.addEventListener('visibilitychange', refreshOnVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshOnVisible)
    }
  }, [enabled, loadProgress])

  useEffect(() => {
    if (!isOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isOpen])

  if (!enabled) return null

  const nearlyFinishedCount = participants.filter(participant => participant.progress_percent >= 75).length

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true)
          void loadProgress()
        }}
        aria-expanded={isOpen}
        aria-controls="live-survey-progress-dialog"
        title={participants.length > 0
          ? `${participants.length} participant${participants.length === 1 ? '' : 's'} completing the survey now${nearlyFinishedCount > 0 ? ` · ${nearlyFinishedCount} nearly finished` : ''}`
          : 'No participants are actively completing the survey'}
        className="group relative inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/15 px-3 py-2 text-left transition hover:border-violet-300/50 hover:bg-violet-500/25"
      >
        <span className="relative grid h-6 w-6 place-items-center rounded-lg bg-violet-400/15 text-violet-200">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          {participants.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-slate-900 bg-emerald-400 animate-pulse" />
          )}
        </span>
        <span className="leading-none">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-violet-300/75">Survey live</span>
          <span className="mt-1 block text-xs font-black text-violet-100">
            {loading && participants.length === 0 ? '…' : participants.length} active
          </span>
        </span>
        {nearlyFinishedCount > 0 && (
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200">
            {nearlyFinishedCount} near
          </span>
        )}
        {error && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-400" aria-label="Live tracker unavailable" />}
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <>
          <button
            type="button"
            aria-label="Close live survey progress"
            className="fixed inset-0 z-[1190] cursor-default bg-slate-950/80 backdrop-blur-[3px]"
            onClick={() => setIsOpen(false)}
          />
          <div
            id="live-survey-progress-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-survey-progress-title"
            dir="rtl"
            className="fixed inset-x-3 top-4 z-[1200] mx-auto flex max-h-[calc(100dvh-2rem)] w-auto max-w-5xl flex-col overflow-hidden rounded-2xl border border-violet-300/20 bg-slate-950 shadow-2xl shadow-violet-950/50 sm:top-10 sm:max-h-[calc(100dvh-5rem)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-l from-violet-950/80 to-slate-950 px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative rounded-xl border border-violet-300/20 bg-violet-400/10 p-2.5 text-violet-200">
                  <Activity className="h-5 w-5" aria-hidden="true" />
                  {participants.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-400 animate-pulse" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="live-survey-progress-title" className="text-sm font-black text-white">الاستبيان الآن</h2>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-300">{participants.length} نشط</span>
                    {nearlyFinishedCount > 0 && (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-200">{nearlyFinishedCount} قريب من النهاية</span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">فقط من لديه صفحة الاستبيان مفتوحة الآن · تحديث تلقائي كل 3 ثوانٍ</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => void loadProgress()} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="تحديث">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setIsOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="إغلاق">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-4 mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200 sm:mx-5">{error} — سيتم إعادة المحاولة تلقائيًا.</div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4" aria-live="polite">
              {loading && participants.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400"><RefreshCw className="h-4 w-4 animate-spin" /> جاري التحقق من المتواجدين…</div>
              ) : participants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <UserRound className="mb-2 h-8 w-8 text-slate-600" aria-hidden="true" />
                  <p className="text-sm font-bold text-slate-300">لا أحد يعبّي الاستبيان الآن</p>
                  <p className="mt-1 text-[10px] text-slate-600">الشخص يختفي عند إغلاق الصفحة أو مغادرتها.</p>
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {participants.map(participant => {
                    const status = progressStatus(participant.progress_percent)
                    const genderLabel = participant.gender === 'male' ? 'ذكر' : participant.gender === 'female' ? 'أنثى' : null
                    const personalDetailsHidden = !participant.gender_revealed && !participant.age_revealed
                    return (
                      <article key={participant.participant_id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate text-sm font-black text-white">{participant.name || `المشارك #${participant.assigned_number}`}</p>
                              {participant.name && <span className="text-[10px] font-semibold text-slate-500">#{participant.assigned_number}</span>}
                              {participant.event_id !== currentEventId && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-500">فعالية {participant.event_id}</span>}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                              {genderLabel && participant.gender_revealed && (
                                <span className={`rounded-md border px-1.5 py-0.5 font-bold ${participant.gender === 'male' ? 'border-blue-400/20 bg-blue-400/10 text-blue-200' : 'border-pink-400/20 bg-pink-400/10 text-pink-200'}`}>{genderLabel}</span>
                              )}
                              {participant.age !== null && participant.age_revealed && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 font-bold text-amber-100"><CakeSlice className="h-3 w-3" aria-hidden="true" /> {participant.age} سنة</span>
                              )}
                              {personalDetailsHidden && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-slate-500"><EyeOff className="h-3 w-3" /> العمر والجنس يظهران بعد الانتقال للصفحة التالية</span>
                              )}
                              <span className={`rounded-md border px-1.5 py-0.5 font-bold ${status.bg} ${status.color}`}>{status.label}</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-left" dir="ltr">
                            <p className="font-mono text-xl font-black tabular-nums text-white">{participant.progress_percent}%</p>
                            <p className="text-[9px] text-slate-600">{participant.answered_questions}/{participant.total_questions}</p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400 transition-[width] duration-500" style={{ width: `${participant.progress_percent}%` }} />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                          <span>الصفحة {participant.current_page + 1} من {participant.total_pages}</span>
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> نشط منذ {elapsedLabel(participant.started_at, serverNow)}</span>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
