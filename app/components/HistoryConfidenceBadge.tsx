import { useEffect, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import * as Tooltip from "@radix-ui/react-tooltip"
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Brain,
  ChevronLeft,
  Heart,
  History,
  Info,
  MessageSquare,
  MousePointerClick,
  ShieldAlert,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react"

type Props = {
  pair?: any
  compact?: boolean
}

type Tone = "danger" | "warning" | "positive" | "info"

const toneClasses: Record<Tone, string> = {
  danger: "border-red-400/40 bg-red-500/15 text-red-100",
  warning: "border-amber-400/35 bg-amber-500/15 text-amber-100",
  positive: "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
  info: "border-cyan-400/30 bg-cyan-500/12 text-cyan-100",
}

const tonePanelClasses: Record<Tone, string> = {
  danger: "border-red-400/30 bg-red-500/[0.08]",
  warning: "border-amber-400/25 bg-amber-500/[0.07]",
  positive: "border-emerald-400/25 bg-emerald-500/[0.07]",
  info: "border-cyan-400/20 bg-cyan-500/[0.05]",
}

const SOURCE_META: Record<string, { label: string; icon: typeof History; color: string }> = {
  ranking: { label: "ترتيب مباشر", icon: Star, color: "text-amber-300" },
  pair_feedback: { label: "لقاء وتقييم ثنائي", icon: MessageSquare, color: "text-cyan-300" },
  group_feedback: { label: "تقييم داخل المجموعة", icon: Users, color: "text-purple-300" },
}

const EXPERIENCE_LABELS: Record<string, string> = {
  great: "تجربة ممتازة",
  good: "تجربة جيدة",
  neutral: "تجربة محايدة",
  uncomfortable: "تجربة غير مريحة",
}

const TAG_LABELS: Record<string, string> = {
  fun: "ممتع",
  comfortable: "مريح",
  good_listener: "مستمع جيد",
  respectful: "محترم",
  engaging: "متفاعل",
  hard_to_connect: "صعب التواصل معه",
  interrupts: "يقاطع",
  dominates: "يسيطر على الحوار",
  disrespectful: "غير محترم",
}

const BADGE_DEFINITIONS: Record<string, { label: string; description: string; tone: Tone }> = {
  never_pair: { label: "توصية: لا تجمعهما", tone: "danger", description: "رفض متبادل أو إشارة سلبية مؤكدة من أكثر من نوع دليل. يحتاج الاستبعاد الدائم إلى موافقة المنظّم." },
  conflicting_interest: { label: "تحذير: إشارات متعارضة", tone: "danger", description: "أحدهما أظهر اهتماماً واضحاً والآخر أعطى إشارة سلبية قوية." },
  mutual_interest: { label: "اهتمام متبادل موثّق", tone: "positive", description: "كلا الطرفين أعطى الآخر إشارة إيجابية مباشرة في لقاءات سابقة." },
  mutual_like: { label: "اهتمام متبادل موثّق", tone: "positive", description: "كلا الطرفين أعطى الآخر إشارة إيجابية مباشرة في لقاءات سابقة." },
  one_sided_interest: { label: "اهتمام غير متبادل", tone: "warning", description: "طرف واحد أظهر اهتماماً واضحاً ولا توجد إشارة مقابلة كافية من الطرف الآخر." },
  least_ranked: { label: "وُضع أخيراً سابقاً", tone: "warning", description: "أحد الطرفين وضع الآخر في آخر ترتيب سابق؛ هذا يخفض الأولوية ولا يفرض حظراً وحده." },
  positive_history: { label: "سجل مباشر إيجابي", tone: "positive", description: "التقييمات أو الترتيبات المباشرة بين الطرفين تميل بوضوح إلى الإيجابية." },
  negative_history: { label: "سجل مباشر سلبي", tone: "warning", description: "التقييمات أو الترتيبات المباشرة بين الطرفين تميل إلى السلبية." },
  predicted_good: { label: "توقع غير مباشر إيجابي", tone: "info", description: "توقع مبني على حالات واستبيانات مشابهة، وليس على تقييم مباشر بين الطرفين." },
  predicted_risk: { label: "توقع غير مباشر حذر", tone: "warning", description: "أنماط الحالات المشابهة تميل إلى نتيجة أقل من المعتاد؛ ليس رفضاً مباشراً من أي طرف." },
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function clampPercent(value: unknown) {
  return Math.max(0, Math.min(100, Math.round(finite(value) || 0)))
}

function tone(value: unknown): Tone {
  return value === "danger" || value === "warning" || value === "positive" ? value : "info"
}

function badgeIcon(code?: string) {
  if (code === "never_pair" || code === "exclude") return Ban
  if (code === "mutual_interest" || code === "mutual" || code === "mutual_like" || code === "positive_history" || code === "direct_positive") return Heart
  if (code === "conflicting_interest" || code === "conflict") return ShieldAlert
  if (code === "one_sided_interest" || code === "one_sided" || code === "least_ranked" || code === "negative_history" || code === "predicted_risk" || code === "direct_negative") return AlertTriangle
  if (code === "predicted_good" || code === "predicted_positive" || code === "predicted_neutral") return Brain
  return History
}

function confidenceLabel(value: number) {
  if (value >= 65) return "ثقة قوية"
  if (value >= 40) return "ثقة متوسطة"
  if (value > 0) return "ثقة محدودة"
  return "لا توجد ثقة قابلة للقياس"
}

function legacyVerdict(pair: any) {
  const badges = Array.isArray(pair?.history_badges) ? pair.history_badges : []
  const primary = badges.find((badge: any) => badge?.code === "never_pair")
    || badges.find((badge: any) => badge?.code === "conflicting_interest")
    || badges.find((badge: any) => badge?.code === "mutual_interest" || badge?.code === "mutual_like")
    || badges.find((badge: any) => badge?.code === "one_sided_interest")
    || badges.find((badge: any) => badge?.code === "negative_history" || badge?.code === "positive_history")
    || badges.find((badge: any) => badge?.code === "predicted_risk" || badge?.code === "predicted_good")
  const directScore = finite(pair?.historical_outcome_score)
  const directConfidence = clampPercent(pair?.historical_confidence)
  const predictedScore = finite(pair?.predictive_outcome_score)
  const predictedConfidence = clampPercent(pair?.predictive_confidence)
  const usesPrediction = !primary || String(primary?.code || "").startsWith("predicted_")
  const confidence = usesPrediction && directScore == null ? predictedConfidence : directConfidence
  if (primary) {
    const definition = BADGE_DEFINITIONS[String(primary.code || "")]
    return {
      code: primary.code,
      label_ar: definition?.label || primary.label_ar,
      tone: definition?.tone || tone(primary.tone),
      confidence,
      confidence_label_ar: confidenceLabel(confidence),
      basis_ar: primary.description_ar || definition?.description || "افتح سجل الأدلة لمعرفة البيانات التي أدت إلى هذه الإشارة.",
    }
  }
  if (directScore != null) {
    return {
      code: directScore >= 50 ? "direct_positive" : "direct_negative",
      label_ar: directScore >= 50 ? "سجل مباشر يميل للإيجابية" : "سجل مباشر يميل للسلبية",
      tone: directScore >= 50 ? "positive" as Tone : "warning" as Tone,
      confidence: directConfidence,
      confidence_label_ar: confidenceLabel(directConfidence),
      basis_ar: "توجد إشارات مباشرة قليلة أو غير حاسمة بين الطرفين.",
    }
  }
  return {
    code: "limited",
    label_ar: predictedScore == null ? "لا يوجد تاريخ كافٍ" : "توقع غير مباشر منخفض الثقة",
    tone: "info" as Tone,
    confidence: predictedConfidence,
    confidence_label_ar: confidenceLabel(predictedConfidence),
    basis_ar: predictedScore == null
      ? "لا توجد لقاءات أو تقييمات أو حالات مشابهة كافية."
      : "هذا توقع من حالات مشابهة وليس تقييماً مباشراً بين الطرفين.",
  }
}

function getVerdict(pair: any) {
  const verdict = pair?.history_verdict
  if (!verdict?.label_ar) return legacyVerdict(pair)
  const confidence = clampPercent(verdict.confidence)
  return {
    ...verdict,
    tone: tone(verdict.tone),
    confidence,
    confidence_label_ar: verdict.confidence_label_ar || confidenceLabel(confidence),
  }
}

function pairNumbers(pair: any): [number | null, number | null] {
  const directionA = pair?.history_direction_a_to_b
  const directionB = pair?.history_direction_b_to_a
  const first = finite(pair?.participant_a ?? pair?.a ?? pair?.participant_a_number ?? directionA?.ranker ?? directionB?.target)
  const second = finite(pair?.participant_b ?? pair?.b ?? pair?.participant_b_number ?? directionA?.target ?? directionB?.ranker)
  return [first == null ? null : Math.round(first), second == null ? null : Math.round(second)]
}

function tooltipLines(pair: any, verdict: any) {
  const evidence = pair?.historical_evidence || {}
  const directScore = finite(pair?.historical_outcome_score)
  const predictedScore = finite(pair?.predictive_outcome_score)
  const lines = [verdict.basis_ar]
  if (directScore != null) {
    lines.push(`مباشر: ${Math.round(directScore)}/100 من ${Number(evidence.total || 0)} دليل عبر ${Number(evidence.events || 0)} فعالية.`)
  } else {
    lines.push("لا توجد نتيجة مباشرة كافية بين الطرفين.")
  }
  if (predictedScore != null) {
    lines.push(`غير مباشر: ${Math.round(predictedScore)}/100 من ${Number(evidence.predictor_neighbors || 0)} حالة مشابهة.`)
  }
  lines.push("النتيجة تعبّر عن اتجاه الأدلة وليست احتمال نجاح مضموناً.")
  return lines
}

export function HistoryConfidenceBadges({ pair, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  if (!pair?.history_confidence_enabled) return null
  const badges = Array.isArray(pair.history_badges) ? pair.history_badges : []
  const hasSignal = finite(pair.historical_outcome_score) != null
    || finite(pair.predictive_outcome_score) != null
    || badges.length > 0
    || (Array.isArray(pair.history_timeline) && pair.history_timeline.length > 0)
  if (!hasSignal) return null
  const verdict = getVerdict(pair)
  const Icon = badgeIcon(verdict.code)
  const lines = tooltipLines(pair, verdict)
  const displayLabel = `${verdict.label_ar} · ${verdict.confidence}%`

  return (
    <>
      <Tooltip.Provider delayDuration={180}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <span
              role="button"
              tabIndex={0}
              aria-label={`${displayLabel}. اضغط لعرض سجل الأدلة`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); setOpen(true) }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                event.stopPropagation()
                setOpen(true)
              }}
              className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border font-black outline-none transition hover:brightness-125 focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${compact ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-1 text-[10px]"} ${toneClasses[tone(verdict.tone)]}`}
            >
              <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
              {displayLabel}
              {!compact && <ChevronLeft className="h-2.5 w-2.5 opacity-60" />}
            </span>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              sideOffset={8}
              className="z-[1000001] max-w-[330px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-right text-[10px] leading-5 text-slate-200 shadow-2xl"
              dir="rtl"
            >
              <p className="font-black text-white">{displayLabel} · {verdict.confidence_label_ar}</p>
              {lines.map((line: string) => <p key={line} className="mt-0.5 text-slate-300">{line}</p>)}
              <p className="mt-1 flex items-center gap-1 font-black text-cyan-300"><MousePointerClick className="h-3 w-3" /> اضغط لعرض التسلسل الكامل</p>
              <Tooltip.Arrow className="fill-slate-950" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
      <HistoryEvidenceDialog pair={pair} open={open} onOpenChange={setOpen} />
    </>
  )
}

export function HistoryConfidencePanel({ pair }: { pair?: any }) {
  const [open, setOpen] = useState(false)
  if (!pair?.history_confidence_enabled) return null
  const directScore = finite(pair.historical_outcome_score)
  const directConfidence = clampPercent(pair.historical_confidence)
  const predictedScore = finite(pair.predictive_outcome_score)
  const predictedConfidence = clampPercent(pair.predictive_confidence)
  const combinedScore = finite(pair.combined_history_score)
  const combinedConfidence = clampPercent(pair.combined_history_confidence)
  const adjustment = finite(pair.history_priority_adjustment) || 0
  const evidence = pair.historical_evidence || {}
  const badges = Array.isArray(pair.history_badges) ? pair.history_badges : []
  const explanations = Array.isArray(pair.history_explanations) ? pair.history_explanations : []
  const averageRaterReliability = finite(evidence.average_rater_reliability)
  const verdict = getVerdict(pair)
  const VerdictIcon = badgeIcon(verdict.code)
  const recommendation = pair.history_review_recommendation === "exclude"
    ? { label: "اقتراح استبعاد · يحتاج موافقة", className: "border-red-400/30 bg-red-500/10 text-red-200" }
    : pair.history_review_recommendation === "review"
      ? { label: "مراجعة بشرية موصى بها", className: "border-amber-400/30 bg-amber-500/10 text-amber-200" }
      : pair.history_review_recommendation === "lock"
        ? { label: "اقتراح تثبيت · يحتاج موافقة", className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" }
        : null
  const hasSignal = directScore != null || predictedScore != null || badges.length > 0 || (Array.isArray(pair.history_timeline) && pair.history_timeline.length > 0)
  if (!hasSignal) return null

  return (
    <>
      <section className={`rounded-2xl border p-3 sm:p-4 ${tonePanelClasses[tone(verdict.tone)]}`} dir="rtl">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="flex items-center gap-2 text-xs font-black text-white">
              <VerdictIcon className={`h-4 w-4 ${verdict.tone === "danger" ? "text-red-300" : verdict.tone === "warning" ? "text-amber-300" : verdict.tone === "positive" ? "text-emerald-300" : "text-cyan-300"}`} />
              {verdict.label_ar}
            </h4>
            <p className="mt-1 text-[10px] leading-5 text-slate-300">{verdict.basis_ar}</p>
            <p className="text-[9px] font-bold text-slate-500">{verdict.confidence_label_ar} ({verdict.confidence}%) · ليست نسبة نجاح مضمونة</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-[10px] font-black text-cyan-200 transition hover:bg-cyan-500/20"
          >
            <History className="h-3.5 w-3.5" /> السجل والتسلسل الكامل
          </button>
        </div>

        {badges.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {badges.map((badge: any) => {
              const Icon = badgeIcon(badge?.code)
              const definition = BADGE_DEFINITIONS[String(badge?.code || "")]
              return <span key={badge?.code || badge?.label_ar} title={badge?.description_ar || definition?.description || badge?.label_ar} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black ${toneClasses[tone(badge?.tone)]}`}><Icon className="h-3 w-3" />{definition?.label || badge?.label_ar}</span>
            })}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="اتجاه السجل المباشر" value={directScore == null ? "لا يوجد" : `${Math.round(directScore)}/100`} detail={directScore == null ? "لا يوجد تقييم بينهما" : `${directConfidence}% ثقة بالدليل`} />
          <Metric label="التوقع غير المباشر" value={predictedScore == null ? "لا يوجد" : `${Math.round(predictedScore)}/100`} detail={predictedScore == null ? "لا توجد حالات مشابهة" : `${predictedConfidence}% ثقة بالتوقع`} />
          <Metric label="الإشارة المجمّعة" value={combinedScore == null ? "محايد" : `${Math.round(combinedScore)}/100`} detail={`${combinedConfidence}% ثقة مجمّعة`} />
          <Metric label="أثره على الترتيب" value={`${adjustment > 0 ? "+" : ""}${adjustment}`} detail={pair.history_hard_blocked ? "موقوف من الاختيار" : "نقاط أولوية فقط"} />
        </div>

        {recommendation && (
          <div className={`mt-3 rounded-xl border px-3 py-2 text-[10px] font-bold leading-5 ${recommendation.className}`}>
            <span className="font-black">{recommendation.label}</span>
            {pair.history_review_reason && <span className="mr-1 opacity-80">— {pair.history_review_reason}</span>}
          </div>
        )}

        <div className="mt-3 grid gap-2 md:grid-cols-[1.35fr_.65fr]">
          <div className="rounded-xl border border-white/8 bg-black/20 p-2.5">
            <p className="flex items-center gap-1 text-[9px] font-black text-slate-300"><Sparkles className="h-3 w-3 text-cyan-300" /> لماذا ظهرت هذه الخلاصة؟</p>
            <ul className="mt-1.5 space-y-1 text-[10px] leading-5 text-slate-300">
              {explanations.map((explanation: string) => <li key={explanation}>• {explanation}</li>)}
              {!explanations.length && <li>• لا توجد إشارة كافية تتجاوز حد العرض.</li>}
            </ul>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 p-2.5 text-[9px] leading-5 text-slate-400">
            <p className="font-black text-slate-300">حجم الأدلة</p>
            <p>{Number(evidence.total || 0)} مباشر · {Number(evidence.events || 0)} فعاليات</p>
            <p>{Number(evidence.ranking || 0)} ترتيب · {Number(evidence.pair_feedback || 0)} تقييم ثنائي</p>
            <p>{Number(evidence.group_feedback || 0)} تقييم مجموعة · {Number(evidence.predictor_neighbors || 0)} حالة مشابهة</p>
            {averageRaterReliability != null && <p>موثوقية المقيمين: {Math.round(averageRaterReliability)}%</p>}
          </div>
        </div>
      </section>
      <HistoryEvidenceDialog pair={pair} open={open} onOpenChange={setOpen} />
    </>
  )
}

function HistoryEvidenceDialog({ pair, open, onOpenChange }: { pair: any; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [requestedFirst, requestedSecond] = pairNumbers(pair)
  const [detailPair, setDetailPair] = useState(pair)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyLoadError, setHistoryLoadError] = useState("")

  useEffect(() => {
    if (!open) return
    setDetailPair(pair)
    setHistoryLoadError("")
    const hasCurrentPayload = Array.isArray(pair?.history_timeline)
      && pair?.history_prediction_details?.baseline_calibrated === true
    if (hasCurrentPayload || requestedFirst == null || requestedSecond == null) return

    const controller = new AbortController()
    setLoadingHistory(true)
    fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get-pair-history-confidence",
        participant_a: requestedFirst,
        participant_b: requestedSecond,
      }),
      signal: controller.signal,
    })
      .then(async response => {
        const data = await response.json()
        if (!response.ok || !data?.success) throw new Error(data?.error || "Failed to load pair history")
        setDetailPair((current: any) => ({ ...current, ...data.analysis, participant_a: requestedFirst, participant_b: requestedSecond }))
      })
      .catch(error => {
        if (error?.name !== "AbortError") setHistoryLoadError("تعذر تحديث السجل الآن؛ المعروض هو آخر تحليل محفوظ.")
      })
      .finally(() => setLoadingHistory(false))
    return () => controller.abort()
  }, [open, pair, requestedFirst, requestedSecond])

  const evidencePair = detailPair || pair
  const verdict = getVerdict(evidencePair)
  const [first, second] = pairNumbers(evidencePair)
  const timeline = Array.isArray(evidencePair?.history_timeline) ? evidencePair.history_timeline : []
  const badges = Array.isArray(evidencePair?.history_badges) ? evidencePair.history_badges : []
  const predictions = evidencePair?.history_prediction_details || {}
  const evidence = evidencePair?.historical_evidence || {}
  const directA = evidencePair?.history_direction_a_to_b || null
  const directB = evidencePair?.history_direction_b_to_a || null
  const VerdictIcon = badgeIcon(verdict.code)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1000002] bg-black/80 backdrop-blur-sm" />
        <Dialog.Content
          dir="rtl"
          onClick={(event) => event.stopPropagation()}
          className="fixed left-1/2 top-1/2 z-[1000003] flex max-h-[92vh] w-[min(960px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-[#080d18] text-right text-slate-100 shadow-2xl outline-none"
        >
          <header className="shrink-0 border-b border-white/10 bg-gradient-to-l from-cyan-950/35 via-slate-950 to-slate-950 px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="flex flex-wrap items-center gap-2 text-base font-black text-white sm:text-lg">
                  <VerdictIcon className="h-5 w-5 text-cyan-300" /> سجل أدلة الزوج
                  {first != null && second != null && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">#{first} ↔ #{second}</span>}
                </Dialog.Title>
                <Dialog.Description className="mt-1 max-w-3xl text-[10px] leading-5 text-slate-400">
                  يعرض كل ترتيب وتقييم مباشر متاح، ثم يفصل التوقع غير المباشر بوضوح. درجة الاتجاه ليست احتمال نجاح مضموناً.
                </Dialog.Description>
                {loadingHistory && <p className="mt-1 text-[9px] font-bold text-cyan-300">جارٍ تحميل أحدث سجل تاريخي…</p>}
                {historyLoadError && <p className="mt-1 text-[9px] font-bold text-amber-300">{historyLoadError}</p>}
              </div>
              <Dialog.Close className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="إغلاق">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className={`rounded-2xl border p-4 ${tonePanelClasses[tone(verdict.tone)]}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white">الخلاصة: {verdict.label_ar}</p>
                  <p className="mt-1 text-[10px] leading-5 text-slate-300">{verdict.basis_ar}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center">
                  <p className="text-[9px] text-slate-500">قوة الاستنتاج</p>
                  <p className="text-sm font-black text-white">{verdict.confidence}%</p>
                  <p className="text-[8px] text-slate-400">{verdict.confidence_label_ar}</p>
                </div>
              </div>
              {badges.length > 0 && (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {badges.map((badge: any) => {
                    const Icon = badgeIcon(badge?.code)
                    const definition = BADGE_DEFINITIONS[String(badge?.code || "")]
                    return (
                      <div key={badge?.code || badge?.label_ar} className="rounded-xl border border-white/8 bg-black/20 p-2.5">
                        <p className="flex items-center gap-1 text-[10px] font-black text-white"><Icon className="h-3.5 w-3.5" /> {definition?.label || badge?.label_ar}</p>
                        <p className="mt-1 text-[9px] leading-4 text-slate-400">{badge?.description_ar || definition?.description || "إشارة مشتقة من سجل الترتيب والتقييم."}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <section className="mt-4">
              <SectionTitle icon={ArrowLeftRight} title="اتجاه كل طرف" detail="المتوسط المجمّع لا يخفي الاختلاف بينهما" />
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <DirectionCard direction={directA} fallbackFrom={first} fallbackTo={second} />
                <DirectionCard direction={directB} fallbackFrom={second} fallbackTo={first} />
              </div>
            </section>

            <section className="mt-5">
              <SectionTitle icon={Activity} title="التسلسل التاريخي المباشر" detail={`${timeline.length} سجل قابل للمراجعة عبر ${Number(evidence.timeline_events ?? evidence.events ?? 0)} فعالية`} />
              {timeline.length ? (
                <div className="relative mt-3 space-y-2 before:absolute before:bottom-3 before:right-[17px] before:top-3 before:w-px before:bg-slate-700/70">
                  {timeline.map((item: any, index: number) => <TimelineItem key={`${item.event_id}-${item.source}-${item.from}-${item.to}-${item.phase || item.group_round || index}`} item={item} />)}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-700 bg-slate-900/35 p-6 text-center">
                  <History className="mx-auto h-7 w-7 text-slate-600" />
                  <p className="mt-2 text-xs font-black text-slate-300">لا يوجد تاريخ مباشر بينهما</p>
                  <p className="mt-1 text-[10px] text-slate-500">أي إشارة معروضة هنا تنبؤية فقط، وليست نتيجة لقاء أو ترتيب بين الطرفين.</p>
                </div>
              )}
            </section>

            <section className="mt-5">
              <SectionTitle icon={Brain} title="كيف تكوّن التوقع غير المباشر؟" detail="مفصول عن التاريخ المباشر ومصحح بحسب نمط التقييم المعتاد" />
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <PredictionCard label={first != null && second != null ? `توقع #${first} تجاه #${second}` : "الاتجاه الأول"} prediction={predictions?.a_to_b} />
                <PredictionCard label={first != null && second != null ? `توقع #${second} تجاه #${first}` : "الاتجاه الثاني"} prediction={predictions?.b_to_a} />
                <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
                  <p className="text-[9px] font-bold text-slate-500">تشابه ملفيهما</p>
                  <p className="mt-1 text-lg font-black text-white">{predictions?.pair_profile_similarity ? `${Math.round(Number(predictions.pair_profile_similarity.score || 0))}%` : "—"}</p>
                  <p className="text-[9px] leading-4 text-slate-400">{Number(predictions?.pair_profile_similarity?.common_features || 0)} إجابة أو سمة مشتركة قابلة للمقارنة</p>
                </div>
              </div>
              <div className="mt-2 flex gap-2 rounded-xl border border-cyan-400/15 bg-cyan-500/[0.04] p-3 text-[9px] leading-5 text-slate-400">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                <p>التوقع يقارن الطرفين بحالات مشابهة، ثم يطرح الميل العام للمقيّم الذي يقيّم الجميع بإيجابية أو سلبية. لهذا لا تظهر «إيجابي» لمجرد أن أغلب التقييمات في النظام مرتفعة.</p>
              </div>
            </section>

            <section className="mt-5 grid gap-2 sm:grid-cols-3">
              <Definition title="درجة الاتجاه" text="0 سلبي جداً، 50 محايد، 100 إيجابي جداً. لا تعني احتمال نجاح العلاقة." />
              <Definition title="الثقة" text="قوة الاستنتاج بحسب كمية الأدلة، تنوع مصادرها، حداثتها، واتساق المقيمين." />
              <Definition title="أثر المطابقة" text={`يغيّر أولوية الاختيار بمقدار ${finite(evidencePair?.history_priority_adjustment) || 0} نقطة فقط؛ نسبة توافق الاستبيان تبقى مستقلة.`} />
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function DirectionCard({ direction, fallbackFrom, fallbackTo }: { direction: any; fallbackFrom: number | null; fallbackTo: number | null }) {
  const score = finite(direction?.score)
  const from = finite(direction?.ranker) ?? fallbackFrom
  const to = finite(direction?.target) ?? fallbackTo
  const sentiment = score == null ? "لا توجد إشارة مباشرة" : score >= 68 ? "إيجابي" : score <= 32 ? "سلبي" : "غير حاسم"
  const sentimentColor = score == null ? "text-slate-400" : score >= 68 ? "text-emerald-300" : score <= 32 ? "text-red-300" : "text-amber-300"
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black text-white">من {from != null ? `#${Math.round(from)}` : "الطرف"} إلى {to != null ? `#${Math.round(to)}` : "الطرف الآخر"}</p>
        <span className={`text-[10px] font-black ${sentimentColor}`}>{sentiment}</span>
      </div>
      {score == null ? (
        <p className="mt-3 text-[10px] leading-5 text-slate-500">لم يرتّب أو يقيّم هذا الطرف الشخص الآخر بإجابة مؤثرة حتى الآن.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <SmallMetric label="الاتجاه" value={`${Math.round(score)}/100`} />
            <SmallMetric label="الثقة" value={`${clampPercent(direction?.confidence)}%`} />
            <SmallMetric label="موثوقية المقيّم" value={`${clampPercent(direction?.rater_reliability)}%`} />
          </div>
          <p className="mt-2 text-[9px] text-slate-500">{Number(direction?.evidence_count || 0)} دليل · {Number(direction?.event_count || 0)} فعاليات</p>
          <div className="mt-2 flex flex-wrap gap-1 text-[8px] font-bold">
            {direction?.first_place_count > 0 && <Flag text="اختاره أولاً" tone="positive" />}
            {direction?.last_place_count > 0 && <Flag text="وضعه أخيراً" tone="warning" />}
            {direction?.wants_connection && <Flag text="يريد التواصل" tone="positive" />}
            {direction?.rejected_connection && <Flag text="رفض التواصل" tone="danger" />}
            {direction?.uncomfortable_group && <Flag text="غير مرتاح بالمجموعة" tone="warning" />}
          </div>
        </>
      )}
    </div>
  )
}

function TimelineItem({ item }: { item: any }) {
  const meta = SOURCE_META[item?.source] || SOURCE_META.ranking
  const Icon = meta.icon
  const feedback = item?.feedback || {}
  const feedbackMetrics = [
    ["توافق", feedback.compatibility_rate, "/100"],
    ["جودة الحوار", feedback.conversation_quality, "/5"],
    ["التواصل الشخصي", feedback.personal_connection, "/5"],
    ["اهتمامات مشتركة", feedback.shared_interests, "/5"],
    ["الراحة", feedback.comfort_level, "/5"],
    ["أسلوب التواصل", feedback.communication_style, "/5"],
    ["يلتقي مجدداً", feedback.would_meet_again, "/5"],
    ["التجربة العامة", feedback.overall_experience, "/5"],
  ].filter(([, value]) => value != null)
  return (
    <div className="relative pr-10">
      <div className="absolute right-0 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-950">
        <Icon className={`h-4 w-4 ${meta.color}`} />
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black text-white">{meta.label} · فعالية {item.event_id}</p>
            <p className="mt-0.5 text-[9px] text-slate-500">#{item.from} قيّم #{item.to}{item.phase ? ` · الجولة ${item.phase}` : item.group_round ? ` · جولة المجموعة ${item.group_round}` : ""}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {item.signal_score != null && <span className="rounded-lg border border-white/8 bg-black/20 px-2 py-1 text-[9px] font-black text-slate-200">اتجاه {Math.round(Number(item.signal_score))}/100</span>}
            {item.rater_reliability != null && <span className="rounded-lg border border-white/8 bg-black/20 px-2 py-1 text-[8px] text-slate-400">موثوقية {Math.round(Number(item.rater_reliability))}%</span>}
          </div>
        </div>

        {item.source === "ranking" && (
          <p className="mt-2 text-[10px] leading-5 text-slate-300">وضعه في المرتبة <span className="font-black text-white">{item.rank}</span> من أصل <span className="font-black text-white">{item.ballot_size}</span>{Number(item.rank) === 1 ? " — الاختيار الأول." : Number(item.rank) === Number(item.ballot_size) ? " — الاختيار الأخير." : "."}</p>
        )}

        {item.source === "pair_feedback" && (
          <div className="mt-2">
            <p className="text-[10px] leading-5 text-slate-300">
              جلسا في لقاء مباشر. {feedback.submitted ? "تم إرسال نموذج التقييم." : "لم يُرسل نموذج تقييم."}
              {feedback.want_connect === true ? <span className="font-black text-emerald-300"> يريد التواصل بعد اللقاء.</span> : feedback.want_connect === false ? <span className="font-black text-red-300"> لا يريد التواصل بعد اللقاء.</span> : null}
            </p>
            {feedbackMetrics.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{feedbackMetrics.map(([label, value, suffix]) => <span key={String(label)} className="rounded-lg bg-black/20 px-2 py-1 text-[8px] text-slate-300">{label}: <b>{String(value)}{suffix}</b></span>)}</div>}
            {item.contributed_to_score === false && <p className="mt-1 text-[8px] text-slate-500">اللقاء محفوظ في التسلسل، لكن الإجابات الافتراضية أو الناقصة لم تؤثر في الدرجة.</p>}
          </div>
        )}

        {item.source === "group_feedback" && (
          <div className="mt-2">
            <p className="text-[10px] text-slate-300">الانطباع: <span className="font-black text-white">{EXPERIENCE_LABELS[item.experience] || item.experience}</span></p>
            {Array.isArray(item.tags) && item.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{item.tags.map((tag: string) => <span key={tag} className="rounded-full border border-purple-400/15 bg-purple-500/10 px-2 py-0.5 text-[8px] text-purple-200">{TAG_LABELS[tag] || tag}</span>)}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function PredictionCard({ label, prediction }: { label: string; prediction: any }) {
  if (!prediction) return <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-3"><p className="text-[9px] font-bold text-slate-500">{label}</p><p className="mt-2 text-[10px] text-slate-400">لا توجد حالات مشابهة كافية لهذا الاتجاه.</p></div>
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
      <p className="text-[9px] font-bold text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-lg font-black text-white">{Math.round(Number(prediction.score || 0))}/100</p>
        <p className="text-[9px] font-bold text-cyan-300">ثقة {Math.round(Number(prediction.confidence || 0))}%</p>
      </div>
      <p className="mt-1 text-[9px] leading-4 text-slate-400">{Number(prediction.neighbour_count || 0)} حالة مشابهة، منها {Number(prediction.personal_analogue_count || 0)} من تفضيلات هذا الطرف نفسه.</p>
      <p className="mt-1 text-[8px] text-slate-600">قبل المعايرة {Math.round(Number(prediction.raw_score_before_baseline || 0))}/100 · خطه المعتاد {Math.round(Number(prediction.rater_baseline || 0))}/100</p>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, detail }: { icon: typeof History; title: string; detail: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-1.5 text-xs font-black text-white"><Icon className="h-4 w-4 text-cyan-300" /> {title}</p><p className="text-[9px] text-slate-500">{detail}</p></div>
}

function Definition({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-white/8 bg-black/20 p-3"><p className="flex items-center gap-1 text-[9px] font-black text-slate-200"><Info className="h-3 w-3 text-cyan-300" /> {title}</p><p className="mt-1 text-[9px] leading-5 text-slate-500">{text}</p></div>
}

function Flag({ text, tone: flagTone }: { text: string; tone: Tone }) {
  return <span className={`rounded-full border px-2 py-0.5 ${toneClasses[flagTone]}`}>{text}</span>
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-white/8 bg-black/20 p-2 text-center"><p className="text-[9px] text-slate-500">{label}</p><p className="mt-1 text-sm font-black text-white">{value}</p><p className="mt-0.5 text-[8px] text-slate-500">{detail}</p></div>
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-black/20 p-2"><p className="text-[8px] text-slate-500">{label}</p><p className="mt-0.5 text-[10px] font-black text-slate-200">{value}</p></div>
}
