import { AlertTriangle, Ban, Brain, Heart, History, ShieldAlert, Sparkles } from "lucide-react"

type Props = {
  pair?: any
  compact?: boolean
}

const toneClasses: Record<string, string> = {
  danger: "border-red-400/40 bg-red-500/15 text-red-100",
  warning: "border-amber-400/35 bg-amber-500/15 text-amber-100",
  positive: "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
  info: "border-cyan-400/30 bg-cyan-500/12 text-cyan-100",
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function badgeIcon(code?: string) {
  if (code === "never_pair") return Ban
  if (code === "mutual_interest" || code === "mutual_like" || code === "positive_history") return Heart
  if (code === "conflicting_interest") return ShieldAlert
  if (code === "one_sided_interest" || code === "least_ranked" || code === "negative_history" || code === "predicted_risk") return AlertTriangle
  if (code === "predicted_good") return Brain
  return History
}

export function HistoryConfidenceBadges({ pair, compact = false }: Props) {
  if (!pair?.history_confidence_enabled) return null
  const badges = Array.isArray(pair.history_badges) ? pair.history_badges : []
  const directScore = finite(pair.historical_outcome_score)
  const directConfidence = finite(pair.historical_confidence) || 0
  const predictedScore = finite(pair.predictive_outcome_score)
  const predictedConfidence = finite(pair.predictive_confidence) || 0
  const primary = badges.find((badge: any) => badge?.code === "never_pair")
    || badges.find((badge: any) => badge?.code === "conflicting_interest")
    || badges.find((badge: any) => badge?.code === "mutual_interest" || badge?.code === "mutual_like")
    || badges.find((badge: any) => badge?.code === "one_sided_interest")
    || badges[0]
  const Icon = badgeIcon(primary?.code)
  const explanations = Array.isArray(pair.history_explanations) ? pair.history_explanations : []
  const title = [
    ...explanations,
    directScore != null ? `السجل المباشر: ${Math.round(directScore)}%، ثقة ${Math.round(directConfidence)}%` : null,
    predictedScore != null ? `التوقع الذكي: ${Math.round(predictedScore)}%، ثقة ${Math.round(predictedConfidence)}%` : null,
    finite(pair.history_priority_adjustment) ? `تعديل أولوية الاختيار: ${Number(pair.history_priority_adjustment) > 0 ? "+" : ""}${pair.history_priority_adjustment}` : null,
  ].filter(Boolean).join("\n")

  if (!primary && directScore == null && predictedScore == null) return null
  const fallbackLabel = directScore != null
    ? `سجل ${Math.round(directScore)}% · ثقة ${Math.round(directConfidence)}%`
    : `توقع ${Math.round(predictedScore || 0)}% · ثقة ${Math.round(predictedConfidence)}%`
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-black ${compact ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-1 text-[10px]"} ${toneClasses[String(primary?.tone || "info")] || toneClasses.info}`}>
      <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {primary?.label_ar || fallbackLabel}
    </span>
  )
}

export function HistoryConfidencePanel({ pair }: { pair?: any }) {
  if (!pair?.history_confidence_enabled) return null
  const directScore = finite(pair.historical_outcome_score)
  const directConfidence = finite(pair.historical_confidence) || 0
  const predictedScore = finite(pair.predictive_outcome_score)
  const predictedConfidence = finite(pair.predictive_confidence) || 0
  const combinedScore = finite(pair.combined_history_score)
  const combinedConfidence = finite(pair.combined_history_confidence) || 0
  const adjustment = finite(pair.history_priority_adjustment) || 0
  const evidence = pair.historical_evidence || {}
  const badges = Array.isArray(pair.history_badges) ? pair.history_badges : []
  const explanations = Array.isArray(pair.history_explanations) ? pair.history_explanations : []
  const averageRaterReliability = finite(evidence.average_rater_reliability)
  const recommendation = pair.history_review_recommendation === "exclude"
    ? { label: "اقتراح استبعاد · يحتاج موافقة", className: "border-red-400/30 bg-red-500/10 text-red-200" }
    : pair.history_review_recommendation === "review"
      ? { label: "مراجعة بشرية موصى بها", className: "border-amber-400/30 bg-amber-500/10 text-amber-200" }
      : pair.history_review_recommendation === "lock"
        ? { label: "اقتراح تثبيت · يحتاج موافقة", className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" }
        : null
  const hasSignal = directScore != null || predictedScore != null || badges.length > 0
  if (!hasSignal) return null

  return (
    <section className={`rounded-2xl border p-3 sm:p-4 ${pair.never_pair_recommended ? "border-red-400/30 bg-red-500/[0.07]" : "border-cyan-400/20 bg-cyan-500/[0.045]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-black text-white">
            {pair.never_pair_recommended ? <ShieldAlert className="h-4 w-4 text-red-300" /> : <Brain className="h-4 w-4 text-cyan-300" />}
            ثقة السجل والتوقع الذكي
          </h4>
          <p className="mt-1 text-[10px] leading-5 text-slate-400">طبقة مستقلة لترتيب الخيارات؛ لا تغيّر نسبة توافق الاستبيان المعروضة.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {badges.map((badge: any) => {
            const Icon = badgeIcon(badge?.code)
            return <span key={badge?.code || badge?.label_ar} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black ${toneClasses[String(badge?.tone || "info")] || toneClasses.info}`}><Icon className="h-3 w-3" />{badge?.label_ar}</span>
          })}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="السجل المباشر" value={directScore == null ? "لا يوجد" : `${Math.round(directScore)}%`} detail={`ثقة ${Math.round(directConfidence)}%`} />
        <Metric label="التوقع الذكي" value={predictedScore == null ? "لا يوجد" : `${Math.round(predictedScore)}%`} detail={`ثقة ${Math.round(predictedConfidence)}%`} />
        <Metric label="الإشارة المجمّعة" value={combinedScore == null ? "محايد" : `${Math.round(combinedScore)}%`} detail={`ثقة ${Math.round(combinedConfidence)}%`} />
        <Metric label="تعديل الأولوية" value={`${adjustment > 0 ? "+" : ""}${adjustment}`} detail={pair.history_hard_blocked ? "محظور من الاختيار" : "حد أقصى مضبوط"} />
      </div>

      {recommendation && (
        <div className={`mt-3 rounded-xl border px-3 py-2 text-[10px] font-bold leading-5 ${recommendation.className}`}>
          <span className="font-black">{recommendation.label}</span>
          {pair.history_review_reason && <span className="mr-1 opacity-80">— {pair.history_review_reason}</span>}
        </div>
      )}

      <div className="mt-3 grid gap-2 md:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-xl border border-white/8 bg-black/20 p-2.5">
          <p className="flex items-center gap-1 text-[9px] font-black text-slate-300"><Sparkles className="h-3 w-3 text-cyan-300" /> لماذا؟</p>
          <ul className="mt-1.5 space-y-1 text-[10px] leading-5 text-slate-300">
            {explanations.map((explanation: string) => <li key={explanation}>• {explanation}</li>)}
          </ul>
        </div>
        <div className="rounded-xl border border-white/8 bg-black/20 p-2.5 text-[9px] leading-5 text-slate-400">
          <p className="font-black text-slate-300">الأدلة</p>
          <p>{Number(evidence.total || 0)} مباشر · {Number(evidence.events || 0)} فعاليات</p>
          <p>{Number(evidence.ranking || 0)} ترتيب · {Number(evidence.pair_feedback || 0)} تقييم ثنائي</p>
          <p>{Number(evidence.group_feedback || 0)} تقييم مجموعة · {Number(evidence.predictor_neighbors || 0)} جيران تنبؤ</p>
          {averageRaterReliability != null && <p>متوسط موثوقية المقيمين: {Math.round(averageRaterReliability)}%</p>}
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-white/8 bg-black/20 p-2 text-center"><p className="text-[9px] text-slate-500">{label}</p><p className="mt-1 text-sm font-black text-white">{value}</p><p className="mt-0.5 text-[8px] text-slate-500">{detail}</p></div>
}
