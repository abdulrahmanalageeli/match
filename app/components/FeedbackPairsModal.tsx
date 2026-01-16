import React, { useEffect, useMemo, useState } from "react";
import { X, RefreshCw, MessageSquare, ThumbsUp, ThumbsDown, Star, Users, CalendarClock } from "lucide-react";

interface FeedbackEntry {
  participant_number: number
  round: number
  event_id: number
  compatibility_rate: number | null
  conversation_quality: number | null
  personal_connection: number | null
  shared_interests: number | null
  comfort_level: number | null
  communication_style: number | null
  overall_experience: number | null
  recommendations?: string | null
  would_meet_again: number | null
  participant_message?: string | null
  submitted_at?: string | null
}

interface ParticipantInfo {
  number: number
  name?: string
  gender?: string
  age?: number | null
  mbti?: string
}

interface FeedbackPairRow {
  match_result_id: string
  event_id: number
  round: number
  participant_a: ParticipantInfo
  participant_b: ParticipantInfo
  compatibility_score: number
  bonus_type: 'none' | 'partial' | 'full' | string
  mutual_match: boolean
  feedback_a: FeedbackEntry | null
  feedback_b: FeedbackEntry | null
  avg_compatibility_rate: number | null
  // New model fields (optional, 100-pt system)
  synergy_score?: number | null
  humor_open_score?: number | null
  intent_score?: number | null
  vibe_compatibility_score?: number | null
  lifestyle_compatibility_score?: number | null
  communication_compatibility_score?: number | null
}

export default function FeedbackPairsModal({ eventId, onClose }: { eventId: number, onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pairs, setPairs] = useState<FeedbackPairRow[]>([])
  const [reloadCounter, setReloadCounter] = useState(0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-event-feedback-pairs', event_id: eventId })
        })
        const data = await res.json()
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || 'Failed to load feedback pairs')
        }
        setPairs(data.pairs || [])
      } catch (e: any) {
        console.error('FeedbackPairs load error', e)
        setError(e?.message || 'حدث خطأ أثناء تحميل أزواج التقييم')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [eventId, reloadCounter])

  const stats = useMemo(() => {
    const withAny = pairs.filter(p => p.feedback_a || p.feedback_b)
    const withBoth = pairs.filter(p => p.feedback_a && p.feedback_b)
    const avg = (() => {
      const vals: number[] = []
      pairs.forEach(p => {
        if (typeof p.avg_compatibility_rate === 'number') vals.push(p.avg_compatibility_rate)
      })
      if (vals.length === 0) return null
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    })()
    return {
      total: pairs.length,
      withAny: withAny.length,
      withBoth: withBoth.length,
      avg
    }
  }, [pairs])

  const getRateColor = (n?: number | null) => {
    if (n == null) return 'text-slate-400'
    if (n >= 80) return 'text-emerald-400'
    if (n >= 60) return 'text-green-400'
    if (n >= 40) return 'text-yellow-400'
    return 'text-red-400'
  }

  return (
    <div className="fixed inset-0 z-100 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-6xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3 text-cyan-300">
            <MessageSquare className="w-5 h-5" />
            <h2 className="text-lg font-bold">أزواج التقييم - حدث {eventId}</h2>
            <span className="text-xs text-slate-400">مطابقة التقييم حسب الجولة</span>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-800 text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats / Actions */}
        <div className="p-4 bg-slate-800/50 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-cyan-200 flex items-center gap-2"><Users className="w-4 h-4"/> إجمالي الأزواج: <b className="text-white">{stats.total}</b></span>
          <span className="text-blue-200 flex items-center gap-2"><ThumbsUp className="w-4 h-4"/> يوجد تقييم (واحد على الأقل): <b className="text-white">{stats.withAny}</b></span>
          <span className="text-purple-200 flex items-center gap-2"><Star className="w-4 h-4"/> تقييم من الطرفين: <b className="text-white">{stats.withBoth}</b></span>
          <span className="text-emerald-200 flex items-center gap-2"><CalendarClock className="w-4 h-4"/> متوسط التوافق (من التقييم): <b className={`text-white ${getRateColor(stats.avg || null)}`}>{stats.avg ?? '-' }%</b></span>
          <button
            onClick={() => setReloadCounter(c => c + 1)}
            className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-cyan-200 flex items-center justify-center gap-3">
              <RefreshCw className="w-5 h-5 animate-spin"/> جاري التحميل...
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-400">{error}</div>
          ) : pairs.length === 0 ? (
            <div className="p-6 text-center text-yellow-400">لا توجد بيانات تقييم لهذا الحدث.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/70 text-slate-200">
                  <th className="p-3 text-right">الجولة</th>
                  <th className="p-3 text-right">المشارك أ</th>
                  <th className="p-3 text-right">المشارك ب</th>
                  <th className="p-3 text-right">توافق النظام</th>
                  <th className="p-3 text-right whitespace-nowrap">تفصيل 100</th>
                  <th className="p-3 text-right">تقييم A</th>
                  <th className="p-3 text-right">تقييم B</th>
                  <th className="p-3 text-right">متوسط التقييم</th>
                  <th className="p-3 text-right">يرغب بالمقابلة؟</th>
                  <th className="p-3 text-right">رسالة</th>
                  <th className="p-3 text-right">أرسل في</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((row) => {
                  const a = row.participant_a
                  const b = row.participant_b
                  const aFb = row.feedback_a
                  const bFb = row.feedback_b
                  const wishes = [aFb?.would_meet_again, bFb?.would_meet_again]
                    .filter((v): v is number => typeof v === 'number')
                    .map(v => v >= 3)
                  const wants = wishes.length > 0 ? (wishes.filter(Boolean).length >= Math.ceil(wishes.length/2)) : null
                  const anyMsg = aFb?.participant_message || bFb?.participant_message || ''
                  const sentAt = aFb?.submitted_at || bFb?.submitted_at || null

                  // Helper to colorize by percent
                  const pctColor = (score: number, max: number) => {
                    const pct = Math.round((Math.max(0, score) / (max || 1)) * 100)
                    if (pct >= 80) return 'text-emerald-400'
                    if (pct >= 60) return 'text-green-400'
                    if (pct >= 40) return 'text-yellow-400'
                    return 'text-red-400'
                  }

                  return (
                    <tr key={`${row.match_result_id}`} className="border-t border-slate-800 text-slate-300">
                      <td className="p-3 whitespace-nowrap">{row.round}</td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="text-white font-bold">#{a.number} • {a.name || 'غير معروف'}</span>
                          <span className="text-xs text-slate-400">{a.gender ?? ''} {a.age ? `• ${a.age}` : ''} {a.mbti ? `• ${a.mbti}` : ''}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="text-white font-bold">#{b.number} • {b.name || 'غير معروف'}</span>
                          <span className="text-xs text-slate-400">{b.gender ?? ''} {b.age ? `• ${b.age}` : ''} {b.mbti ? `• ${b.mbti}` : ''}</span>
                        </div>
                      </td>
                      <td className="p-3 font-bold whitespace-nowrap">
                        <span className={getRateColor(row.compatibility_score)}>{row.compatibility_score}%</span>
                      </td>
                      {/* 100-pt breakdown (compact) */}
                      <td className="p-3 align-top">
                        {(
                          row.synergy_score != null ||
                          row.vibe_compatibility_score != null ||
                          row.lifestyle_compatibility_score != null ||
                          row.humor_open_score != null ||
                          row.communication_compatibility_score != null ||
                          row.intent_score != null
                        ) ? (
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                            <div>
                              <span className="text-slate-400">التفاعل:</span>{' '}
                              <span className={pctColor(row.synergy_score ?? 0, 35)}>{Math.round(row.synergy_score ?? 0)}/35</span>
                            </div>
                            <div>
                              <span className="text-slate-400">الطاقة:</span>{' '}
                              <span className={pctColor(row.vibe_compatibility_score ?? 0, 20)}>{Math.round(row.vibe_compatibility_score ?? 0)}/20</span>
                            </div>
                            <div>
                              <span className="text-slate-400">الحياة:</span>{' '}
                              <span className={pctColor(row.lifestyle_compatibility_score ?? 0, 15)}>{Math.round(row.lifestyle_compatibility_score ?? 0)}/15</span>
                            </div>
                            <div>
                              <span className="text-slate-400">الدعابة/الانفتاح:</span>{' '}
                              <span className={pctColor(row.humor_open_score ?? 0, 15)}>{Math.round(row.humor_open_score ?? 0)}/15</span>
                            </div>
                            <div>
                              <span className="text-slate-400">التواصل:</span>{' '}
                              <span className={pctColor(row.communication_compatibility_score ?? 0, 10)}>{Math.round(row.communication_compatibility_score ?? 0)}/10</span>
                            </div>
                            <div>
                              <span className="text-slate-400">الأهداف:</span>{' '}
                              <span className={pctColor(row.intent_score ?? 0, 5)}>{Math.round(row.intent_score ?? 0)}/5</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {aFb ? (
                          <div className="space-y-1">
                            <span className={`block font-bold ${getRateColor(aFb.compatibility_rate)}`}>{aFb.compatibility_rate ?? '-'}%</span>
                            <span className="block text-[11px] text-slate-400">تجربة: {aFb.overall_experience ?? '-'}</span>
                            <span className="block text-[11px] text-slate-500">حديث: {aFb.conversation_quality ?? '-'} • اتصال: {aFb.personal_connection ?? '-'} • اهتمامات: {aFb.shared_interests ?? '-'}</span>
                            <span className="block text-[11px] text-slate-500">ارتياح: {aFb.comfort_level ?? '-'} • تواصل: {aFb.communication_style ?? '-'}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {bFb ? (
                          <div className="space-y-1">
                            <span className={`block font-bold ${getRateColor(bFb.compatibility_rate)}`}>{bFb.compatibility_rate ?? '-'}%</span>
                            <span className="block text-[11px] text-slate-400">تجربة: {bFb.overall_experience ?? '-'}</span>
                            <span className="block text-[11px] text-slate-500">حديث: {bFb.conversation_quality ?? '-'} • اتصال: {bFb.personal_connection ?? '-'} • اهتمامات: {bFb.shared_interests ?? '-'}</span>
                            <span className="block text-[11px] text-slate-500">ارتياح: {bFb.comfort_level ?? '-'} • تواصل: {bFb.communication_style ?? '-'}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="p-3 font-bold whitespace-nowrap">
                        <span className={getRateColor(row.avg_compatibility_rate)}>{row.avg_compatibility_rate ?? '-' }%</span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {wants == null ? <span className="text-slate-500">—</span> : wants ? (
                          <span className="text-emerald-400 inline-flex items-center gap-1"><ThumbsUp className="w-4 h-4"/> نعم</span>
                        ) : (
                          <span className="text-red-400 inline-flex items-center gap-1"><ThumbsDown className="w-4 h-4"/> لا</span>
                        )}
                      </td>
                      <td className="p-3 max-w-[260px]">
                        <span className="text-slate-300 whitespace-pre-line break-words">{anyMsg || '—'}</span>
                      </td>
                      <td className="p-3 whitespace-nowrap text-slate-400 text-xs">{sentAt ? new Date(sentAt).toLocaleString() : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
