import { useMemo, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Eye,
  Heart,
  MessageSquare,
  Search,
  Sparkles,
  X,
} from "lucide-react"

export type GroupMemberFeedbackSubmission = {
  reviewer_number: number
  reviewer_name?: string
  member_number: number
  member_name?: string
  group_round: number
  experience?: string
  tags?: string[]
  organizer_note?: string
  submitted_at?: string | null
}

export type GroupMemberFeedbackData = {
  submissions: GroupMemberFeedbackSubmission[]
  summary?: any[]
  reviewer_count?: number
  participant_count?: number
  event_id?: number | null
  test_mode?: boolean
}

type SeatingMember = {
  number?: number | string
  name?: string
  [key: string]: any
}

type SeatingData = {
  1?: Record<string, SeatingMember[]>
  2?: Record<string, SeatingMember[]>
  [key: number]: Record<string, SeatingMember[]> | undefined
}

type DislikeRankingEntry = {
  number?: number
  name?: string
  like_score?: number
  dislike_score?: number
  first_place_count?: number
  first_place_rate?: number
  last_place_count?: number
  last_place_rate?: number
  top_third_count?: number
  bottom_third_count?: number
  received_rankings?: number
  events_count?: number
  [key: string]: any
}

type DislikeRankingsData = {
  event_id?: number | null
  event?: DislikeRankingEntry[]
  overall?: DislikeRankingEntry[]
}

type RoundStats = {
  reviews: number
  scoreTotal: number
  positive: number
  neutral: number
  negative: number
  average: number
  positiveRate: number
  neutralRate: number
  negativeRate: number
}

type TagCount = [string, number]

type PersonInsight = {
  number: number
  name: string
  reviews: number
  scoreTotal: number
  average: number
  positive: number
  neutral: number
  negative: number
  positiveRate: number
  neutralRate: number
  negativeRate: number
  confidenceLabel: string
  polarizingScore: number
  tagCounts: TagCount[]
  positiveTags: TagCount[]
  negativeTags: TagCount[]
  neutralTags: TagCount[]
  roundBreakdown: Record<number, RoundStats>
  reviewedRounds: number
  negativeRounds: number
  positiveRounds: number
  notes: GroupMemberFeedbackSubmission[]
  submissions: GroupMemberFeedbackSubmission[]
  historyCurrent?: DislikeRankingEntry
  historyOverall?: DislikeRankingEntry
  summaryText: string
}

type GroupInsight = {
  key: string
  round: number
  table: string
  members: SeatingMember[]
  submissions: GroupMemberFeedbackSubmission[]
  reviews: number
  average: number
  positive: number
  neutral: number
  negative: number
  positiveRate: number
  neutralRate: number
  negativeRate: number
  commonTags: TagCount[]
  commonPositiveTags: TagCount[]
  commonNegativeTags: TagCount[]
  dominantNegativeTarget: { number: number; name: string; count: number; share: number } | null
}

type ViewMode = "all" | "negative" | "polarizing" | "groups" | "notes" | "raw"

const RANKING_HELP: Partial<Record<ViewMode, string>> = {
  all: "مرتب حسب المتوسط الفعلي من الأعلى إلى الأقل. عند التعادل تظهر العينة الأكبر أولًا.",
  negative: "مرتب حسب المتوسط الفعلي من الأقل إلى الأعلى؛ فمثلًا 2.45 يظهر قبل 3.17.",
  polarizing: "مرتب حسب وجود تقييمات إيجابية وسلبية للشخص نفسه، وليس حسب انخفاض المتوسط.",
}

const EXPERIENCE_SCORE: Record<string, number> = {
  uncomfortable: 1,
  neutral: 2,
  good: 3,
  great: 4,
}

const EXPERIENCE_LABELS: Record<string, string> = {
  great: "ممتازة",
  good: "جيدة",
  neutral: "محايدة",
  uncomfortable: "غير مريحة",
}

const TAG_LABELS: Record<string, string> = {
  fun: "ممتع",
  comfortable: "مريح",
  good_listener: "مستمع جيد",
  respectful: "محترم",
  engaging: "متفاعل",
  quiet: "هادئ",
  hard_to_connect: "صعب التواصل",
  interrupts: "يقاطع",
  dominates: "يسيطر على الحديث",
  disrespectful: "غير محترم",
}

const POSITIVE_TAGS = new Set(["fun", "comfortable", "good_listener", "respectful", "engaging"])
const NEGATIVE_TAGS = new Set(["hard_to_connect", "interrupts", "dominates", "disrespectful"])
const NEUTRAL_TAGS = new Set(["quiet"])

const pct = (value: number) => `${Math.round(value * 100)}%`
const round1 = (value: number) => Math.round(value * 10) / 10

function confidenceLabel(count: number) {
  if (count >= 6) return "عينة جيدة"
  if (count >= 3) return "عينة متوسطة"
  return "عينة صغيرة"
}

function averageLabel(value: number) {
  if (value >= 3.5) return "مرتفع جدًا"
  if (value >= 3) return "مرتفع"
  if (value >= 2.5) return "متوسط"
  if (value >= 2) return "منخفض"
  return "منخفض جدًا"
}

function reviewCountLabel(count: number) {
  if (count === 1) return "تقييم واحد"
  if (count === 2) return "تقييمان"
  if (count >= 3 && count <= 10) return `${count} تقييمات`
  return `${count} تقييمًا`
}

function noteCountLabel(count: number) {
  if (count === 1) return "ملاحظة واحدة"
  if (count === 2) return "ملاحظتان"
  return `${count} ملاحظات`
}

function scoreSubmission(entry: GroupMemberFeedbackSubmission) {
  return EXPERIENCE_SCORE[String(entry.experience || "")] || 0
}

function isPositive(entry: GroupMemberFeedbackSubmission) {
  return entry.experience === "great" || entry.experience === "good"
}

function isNegative(entry: GroupMemberFeedbackSubmission) {
  return entry.experience === "uncomfortable"
}

function isNeutral(entry: GroupMemberFeedbackSubmission) {
  return entry.experience === "neutral"
}

function sortTags(map: Map<string, number>) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

function humanTag(tag: string) {
  return TAG_LABELS[tag] || tag
}

function buildRoundStats(entries: GroupMemberFeedbackSubmission[]): RoundStats {
  const reviews = entries.length
  const positive = entries.filter(isPositive).length
  const neutral = entries.filter(isNeutral).length
  const negative = entries.filter(isNegative).length
  const scoreTotal = entries.reduce((sum, entry) => sum + scoreSubmission(entry), 0)
  return {
    reviews,
    scoreTotal,
    positive,
    neutral,
    negative,
    average: reviews ? scoreTotal / reviews : 0,
    positiveRate: reviews ? positive / reviews : 0,
    neutralRate: reviews ? neutral / reviews : 0,
    negativeRate: reviews ? negative / reviews : 0,
  }
}

function makeSummaryText(person: Omit<PersonInsight, "summaryText">) {
  const pos = person.positiveTags.slice(0, 2).map(([tag]) => humanTag(tag))
  const neg = person.negativeTags.slice(0, 2).map(([tag]) => humanTag(tag))

  let base = "لا يظهر نمط واضح في التقييمات حتى الآن."
  if (person.polarizingScore >= 15 && person.positive > 0 && person.negative > 0) {
    base = "الآراء متباينة بوضوح"
    if (pos.length) base += `؛ تكررت إيجابيًا: ${pos.join("، ")}`
    if (neg.length) base += `، وتحتاج انتباهًا في: ${neg.join("، ")}`
    base += "."
  } else if (person.average < 2.5) {
    base = `متوسطه منخفض (${person.average.toFixed(2)}/4)${neg.length ? `، وأكثر الأسباب تكرارًا: ${neg.join("، ")}` : ""}.`
  } else if (person.average >= 3.25) {
    base = `متوسطه مرتفع (${person.average.toFixed(2)}/4)${pos.length ? `، وأكثر الأسباب تكرارًا: ${pos.join("، ")}` : ""}.`
  } else {
    const parts: string[] = []
    if (pos.length) parts.push(`إيجابيًا: ${pos.join("، ")}`)
    if (neg.length) parts.push(`ويحتاج انتباهًا في: ${neg.join("، ")}`)
    base = parts.length ? `متوسطه ${person.average.toFixed(2)}/4؛ ${parts.join("، ")}.` : `متوسطه ${person.average.toFixed(2)}/4 بدون أسباب متكررة واضحة.`
  }

  if (person.reviews < 3) base += " العينة صغيرة؛ لا تعتمد عليها وحدها."
  return base
}

function personName(entry: GroupMemberFeedbackSubmission, number: number) {
  if (Number(entry.member_number) === number && entry.member_name) return String(entry.member_name)
  if (Number(entry.reviewer_number) === number && entry.reviewer_name) return String(entry.reviewer_name)
  return `#${number}`
}

function MetricCard({
  icon,
  label,
  primary,
  secondary,
  tertiary,
  onClick,
}: {
  icon: ReactNode
  label: string
  primary: string
  secondary?: string
  tertiary?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-2xl border border-white/10 bg-slate-950/65 p-4 text-right transition hover:border-white/20 hover:bg-slate-900/80 disabled:cursor-default"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-400">{label}</span>
        <span className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300">{icon}</span>
      </div>
      <div className="truncate text-lg font-black text-white">{primary}</div>
      {secondary ? <div className="mt-1 text-sm font-semibold text-slate-300">{secondary}</div> : null}
      {tertiary ? <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{tertiary}</div> : null}
    </button>
  )
}
function SegmentedBar({ positive, neutral, negative }: { positive: number; neutral: number; negative: number }) {
  const total = Math.max(1, positive + neutral + negative)
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800" dir="ltr">
      <div className="bg-emerald-400" style={{ width: `${(positive / total) * 100}%` }} />
      <div className="bg-slate-500" style={{ width: `${(neutral / total) * 100}%` }} />
      <div className="bg-rose-400" style={{ width: `${(negative / total) * 100}%` }} />
    </div>
  )
}

function TagPill({ tag, count, tone = "default" }: { tag: string; count?: number; tone?: "positive" | "negative" | "neutral" | "default" }) {
  const cls =
    tone === "positive"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : tone === "negative"
        ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
        : tone === "neutral"
          ? "border-slate-400/20 bg-slate-400/10 text-slate-300"
          : "border-white/10 bg-white/5 text-slate-300"
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${cls}`}>
      {humanTag(tag)}
      {typeof count === "number" ? <span className="opacity-70">×{count}</span> : null}
    </span>
  )
}

function ConfidenceBadge({ reviews }: { reviews: number }) {
  const strong = reviews >= 6
  const medium = reviews >= 3
  const cls = strong
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
    : medium
      ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
      : "border-slate-400/20 bg-slate-400/10 text-slate-400"
  return <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${cls}`}>{confidenceLabel(reviews)}</span>
}

function GroupCard({ group, peopleByNumber, onPerson }: { group: GroupInsight; peopleByNumber: Map<number, PersonInsight>; onPerson: (person: PersonInsight) => void }) {
  const groupMemberNumbers = new Set<number>([
    ...group.members.map(member => Number(member.number)).filter(Number.isFinite),
    ...group.submissions.map(entry => Number(entry.member_number)).filter(Number.isFinite),
  ])
  const localSignals = Array.from(groupMemberNumbers).map(number => {
    const person = peopleByNumber.get(number)
    const stats = buildRoundStats(group.submissions.filter(entry => Number(entry.member_number) === number))
    return { person, stats }
  }).filter(item => item.person && item.stats.reviews > 0) as Array<{ person: PersonInsight; stats: RoundStats }>
  const bestLocal = [...localSignals].sort((a, b) => b.stats.average - a.stats.average || b.stats.reviews - a.stats.reviews)[0]
  const concernLocal = [...localSignals].sort((a, b) => a.stats.average - b.stats.average || b.stats.reviews - a.stats.reviews)[0]
  const chemistry = averageLabel(group.average)

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-indigo-400/20 bg-indigo-400/10 px-2 py-1 text-[11px] font-black text-indigo-200">الجولة {group.round}</span>
            <span className="text-base font-black text-white">{group.table.startsWith("مجموعة ") ? group.table : `طاولة ${group.table}`}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">{group.members.length} مشاركين · {reviewCountLabel(group.reviews)}</div>
        </div>
        <div className="text-left">
          <div className="text-xl font-black text-white">{group.average ? group.average.toFixed(2) : "—"}<span className="text-xs font-medium text-slate-500"> / 4</span></div>
          <div className="text-[11px] font-bold text-slate-400">{chemistry}</div>
        </div>
      </div>

      <div className="mt-4">
        <SegmentedBar positive={group.positive} neutral={group.neutral} negative={group.negative} />
        <div className="mt-2 flex justify-between text-[10px] font-semibold text-slate-500">
          <span>إيجابي {pct(group.positiveRate)}</span>
          <span>محايد {pct(group.neutralRate)}</span>
          <span>سلبي {pct(group.negativeRate)}</span>
        </div>
      </div>

      {group.commonTags.length ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {group.commonTags.slice(0, 5).map(([tag, count]) => (
            <TagPill key={tag} tag={tag} count={count} tone={POSITIVE_TAGS.has(tag) ? "positive" : NEGATIVE_TAGS.has(tag) ? "negative" : "neutral"} />
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {bestLocal ? (
          <button type="button" onClick={() => onPerson(bestLocal.person)} className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3 text-right hover:bg-emerald-400/10">
            <div className="text-[10px] font-bold text-emerald-300">الأعلى تقييمًا داخل المجموعة</div>
            <div className="mt-1 truncate text-sm font-black text-white">{bestLocal.person.name} <span className="font-medium text-slate-500">#{bestLocal.person.number}</span></div>
            <div className="text-[11px] text-slate-400">متوسط {bestLocal.stats.average.toFixed(2)}/4 · {reviewCountLabel(bestLocal.stats.reviews)} هنا</div>
          </button>
        ) : null}
        {concernLocal ? (
          <button type="button" onClick={() => onPerson(concernLocal.person)} className="rounded-xl border border-rose-400/15 bg-rose-400/5 p-3 text-right hover:bg-rose-400/10">
            <div className="text-[10px] font-bold text-rose-300">الأقل تقييمًا داخل المجموعة</div>
            <div className="mt-1 truncate text-sm font-black text-white">{concernLocal.person.name} <span className="font-medium text-slate-500">#{concernLocal.person.number}</span></div>
            <div className="text-[11px] text-slate-400">متوسط {concernLocal.stats.average.toFixed(2)}/4 · سلبي {pct(concernLocal.stats.negativeRate)}</div>
          </button>
        ) : null}
      </div>

      {group.dominantNegativeTarget ? (
        <div className="mt-3 rounded-xl border border-rose-400/15 bg-rose-400/5 px-3 py-2 text-xs leading-5 text-rose-100">
          <AlertTriangle className="ml-1 inline h-3.5 w-3.5" />
          {Math.round(group.dominantNegativeTarget.share * 100)}% من التقييمات السلبية في هذه المجموعة كانت موجّهة إلى {group.dominantNegativeTarget.name} #{group.dominantNegativeTarget.number}.
        </div>
      ) : null}
    </div>
  )
}

function PersonDetailModal({ person, onClose }: { person: PersonInsight; onClose: () => void }) {
  const historicOverall = person.historyOverall
  const historicCurrent = person.historyCurrent
  const raw = [...person.submissions].sort((a, b) => Number(a.group_round) - Number(b.group_round))

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        dir="rtl"
        className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-950 shadow-2xl sm:rounded-3xl"
        onMouseDown={(event: any) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-slate-950/95 p-5 backdrop-blur">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-black text-white">{person.name}</h3>
              <span className="text-sm font-bold text-slate-500">#{person.number}</span>
              <ConfidenceBadge reviews={person.reviews} />
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{person.summaryText}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[10px] font-bold text-slate-500">المتوسط الفعلي</div>
              <div className="mt-1 text-xl font-black text-white">{person.average.toFixed(2)} <span className="text-xs font-medium text-slate-600">/4</span></div>
              <div className="text-[10px] text-slate-500">{averageLabel(person.average)}</div>
            </div>
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-3">
              <div className="text-[10px] font-bold text-emerald-300">إيجابي</div>
              <div className="mt-1 text-xl font-black text-white">{pct(person.positiveRate)}</div>
              <div className="text-[10px] text-slate-500">{person.positive}/{person.reviews}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[10px] font-bold text-slate-400">محايد</div>
              <div className="mt-1 text-xl font-black text-white">{pct(person.neutralRate)}</div>
              <div className="text-[10px] text-slate-500">{person.neutral}/{person.reviews}</div>
            </div>
            <div className="rounded-2xl border border-rose-400/15 bg-rose-400/5 p-3">
              <div className="text-[10px] font-bold text-rose-300">سلبي</div>
              <div className="mt-1 text-xl font-black text-white">{pct(person.negativeRate)}</div>
              <div className="text-[10px] text-slate-500">{person.negative}/{person.reviews}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[10px] font-bold text-slate-500">حجم العينة</div>
              <div className="mt-1 text-xl font-black text-white">{person.reviews}</div>
              <div className="text-[10px] text-slate-500">{person.confidenceLabel}</div>
            </div>
          </div>

          {person.notes.length ? (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black text-amber-100">ملاحظات المنظم</h4>
                  <p className="mt-0.5 text-[11px] text-amber-200/55">ملاحظات خاصة مرتبطة بهذا المشارك، ظاهرة هنا قبل بقية التحليل.</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black text-amber-200"><MessageSquare className="h-3 w-3" /> {noteCountLabel(person.notes.length)}</span>
              </div>
              <div className="space-y-2">
                {person.notes.map((entry, index) => (
                  <div key={`${entry.reviewer_number}-${entry.group_round}-${index}`} className="rounded-xl border border-amber-400/15 bg-black/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-amber-200/55">
                      <span>من {entry.reviewer_name || `#${entry.reviewer_number}`} · #{entry.reviewer_number}</span>
                      <span>الجولة {entry.group_round}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-amber-50">{entry.organizer_note}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-xs text-slate-500">لا توجد ملاحظات منظم خاصة لهذا المشارك.</div>
          )}

          <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-black text-white">الأسباب الأكثر تكرارًا</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">الوسوم التي اختارها أعضاء المجموعات، مع عدد مرات تكرار كل وسم.</p>
              </div>
              <span className="text-xs font-bold text-slate-500">{reviewCountLabel(person.reviews)}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-black text-emerald-300">إشارات إيجابية</div>
                <div className="flex flex-wrap gap-2">
                  {person.positiveTags.length ? person.positiveTags.map(([tag, count]) => <TagPill key={tag} tag={tag} count={count} tone="positive" />) : <span className="text-xs text-slate-600">لا توجد أسباب إيجابية محددة</span>}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-black text-rose-300">إشارات تحتاج انتباه</div>
                <div className="flex flex-wrap gap-2">
                  {person.negativeTags.length ? person.negativeTags.map(([tag, count]) => <TagPill key={tag} tag={tag} count={count} tone="negative" />) : <span className="text-xs text-slate-600">لا توجد أسباب سلبية محددة</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
              <h4 className="text-sm font-black text-white">الثبات بين الجولات</h4>
              <p className="mt-1 text-[11px] text-slate-500">يفرق بين ليلة/مجموعة سيئة وبين نمط ظهر أكثر من مرة.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[1, 2].map(round => {
                  const stats = person.roundBreakdown[round]
                  return (
                    <div key={round} className="rounded-xl border border-white/10 bg-black/15 p-3">
                      <div className="text-[10px] font-bold text-slate-500">الجولة {round}</div>
                      {stats?.reviews ? (
                        <>
                          <div className="mt-1 text-lg font-black text-white">{stats.average.toFixed(2)} <span className="text-[10px] font-medium text-slate-600">/4</span></div>
                          <div className="mt-2"><SegmentedBar positive={stats.positive} neutral={stats.neutral} negative={stats.negative} /></div>
                          <div className="mt-1 text-[10px] text-slate-500">{reviewCountLabel(stats.reviews)} · سلبي {pct(stats.negativeRate)}</div>
                        </>
                      ) : (
                        <div className="mt-3 text-xs text-slate-600">لا توجد تقييمات</div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 text-xs leading-5 text-slate-400">
                {person.negativeRounds >= 2
                  ? "⚠️ كان المتوسط أقل من 2.5 في الجولتين، لذلك الإشارة ليست محصورة في مجموعة واحدة."
                  : person.positiveRounds >= 2
                    ? "✓ كان المتوسط 3.0 أو أعلى في الجولتين، وليس محصورًا في مجموعة واحدة."
                    : "لا يوجد نمط ثابت عبر الجولتين حتى الآن."}
              </div>
            </div>

          </div>

          {(historicCurrent || historicOverall) ? (
            <div className="rounded-2xl border border-violet-400/15 bg-violet-400/5 p-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-violet-300" />
                <h4 className="text-sm font-black text-white">النمط عبر الترتيبات والفعاليات</h4>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">هذه الإشارة من ترتيبات المشاركين، وليست نفس تقييمات المجموعات؛ نعرضها منفصلة حتى لا نخلط المصدرين.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {historicCurrent ? (
                  <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                    <div className="text-[10px] font-bold text-slate-500">الفعالية الحالية</div>
                    <div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-400">إعجاب ترتيبي</span><strong className="text-emerald-300">{round1(Number(historicCurrent.like_score || 0))}</strong></div>
                    <div className="mt-1 flex items-center justify-between text-xs"><span className="text-slate-400">نفور ترتيبي</span><strong className="text-rose-300">{round1(Number(historicCurrent.dislike_score || 0))}</strong></div>
                    <div className="mt-1 text-[10px] text-slate-600">{historicCurrent.received_rankings || 0} ترتيب مستلم</div>
                  </div>
                ) : null}
                {historicOverall ? (
                  <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                    <div className="text-[10px] font-bold text-slate-500">عبر الفعاليات</div>
                    <div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-400">إعجاب ترتيبي</span><strong className="text-emerald-300">{round1(Number(historicOverall.like_score || 0))}</strong></div>
                    <div className="mt-1 flex items-center justify-between text-xs"><span className="text-slate-400">نفور ترتيبي</span><strong className="text-rose-300">{round1(Number(historicOverall.dislike_score || 0))}</strong></div>
                    <div className="mt-1 text-[10px] text-slate-600">{historicOverall.events_count || 0} فعاليات · {historicOverall.received_rankings || 0} ترتيب</div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black text-white">كل التقييمات والملاحظات</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">للتدقيق قبل اتخاذ أي إجراء على مشارك.</p>
              </div>
              <MessageSquare className="h-4 w-4 text-slate-500" />
            </div>
            <div className="space-y-2">
              {raw.map((entry, index) => (
                <div key={`${entry.reviewer_number}-${entry.member_number}-${entry.group_round}-${index}`} className="rounded-xl border border-white/10 bg-black/15 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold text-slate-300">{entry.reviewer_name || `#${entry.reviewer_number}`} <span className="font-medium text-slate-600">#{entry.reviewer_number}</span></div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span>الجولة {entry.group_round}</span>
                      <span className={`rounded-full px-2 py-0.5 font-bold ${isPositive(entry) ? "bg-emerald-400/10 text-emerald-300" : isNegative(entry) ? "bg-rose-400/10 text-rose-300" : "bg-slate-400/10 text-slate-300"}`}>{EXPERIENCE_LABELS[String(entry.experience || "")] || entry.experience || "—"}</span>
                    </div>
                  </div>
                  {entry.tags?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{entry.tags.map(tag => <TagPill key={tag} tag={tag} tone={POSITIVE_TAGS.has(tag) ? "positive" : NEGATIVE_TAGS.has(tag) ? "negative" : "neutral"} />)}</div> : null}
                  {entry.organizer_note ? <div className="mt-2 rounded-lg border border-amber-400/15 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-amber-100">{entry.organizer_note}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GroupFeedbackIntelligence({
  data,
  seating,
  dislikeRankings,
  eventId,
}: {
  data: GroupMemberFeedbackData
  seating?: SeatingData | any
  dislikeRankings?: DislikeRankingsData
  eventId?: number | null
}) {
  const [view, setView] = useState<ViewMode>("all")
  const [query, setQuery] = useState("")
  const [roundFilter, setRoundFilter] = useState<"all" | "1" | "2">("all")
  const [selectedPerson, setSelectedPerson] = useState<PersonInsight | null>(null)
  const [showScoringInfo, setShowScoringInfo] = useState(false)

  const submissions = useMemo(() => (Array.isArray(data?.submissions) ? data.submissions : []).filter(entry => Number.isFinite(Number(entry.member_number)) && Number.isFinite(Number(entry.reviewer_number))), [data])

  const globalStats = useMemo(() => buildRoundStats(submissions), [submissions])

  const tableByRoundAndPerson = useMemo(() => {
    const map = new Map<string, string>()
    for (const round of [1, 2]) {
      const tables = seating?.[round] || {}
      for (const [table, members] of Object.entries(tables as Record<string, SeatingMember[]>)) {
        for (const member of Array.isArray(members) ? members : []) {
          const number = Number(member?.number)
          if (Number.isFinite(number)) map.set(`${round}:${number}`, String(table))
        }
      }
    }
    return map
  }, [seating])

  // Seating is normally supplied by admin3. As a defensive fallback (old events,
  // partial API responses), infer groups from the reviewer↔member graph per round.
  // This keeps group diagnostics usable without pretending the inferred label is a table number.
  const inferredGroupByRoundAndPerson = useMemo(() => {
    const result = new Map<string, string>()
    for (const round of [1, 2]) {
      const roundEntries = submissions.filter(entry => Number(entry.group_round) === round)
      const parent = new Map<number, number>()
      const ensure = (n: number) => { if (!parent.has(n)) parent.set(n, n) }
      const find = (n: number): number => {
        const p = parent.get(n) ?? n
        if (p === n) return n
        const root = find(p)
        parent.set(n, root)
        return root
      }
      const union = (a: number, b: number) => {
        ensure(a); ensure(b)
        const ra = find(a); const rb = find(b)
        if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb))
      }
      roundEntries.forEach(entry => {
        const a = Number(entry.reviewer_number); const b = Number(entry.member_number)
        if (Number.isFinite(a) && Number.isFinite(b)) union(a, b)
      })
      const components = new Map<number, number[]>()
      for (const n of parent.keys()) {
        const root = find(n)
        if (!components.has(root)) components.set(root, [])
        components.get(root)!.push(n)
      }
      const ordered = Array.from(components.values()).sort((a, b) => Math.min(...a) - Math.min(...b))
      ordered.forEach((members, index) => members.forEach(n => result.set(`${round}:${n}`, `مجموعة ${index + 1}*`)))
    }
    return result
  }, [submissions])

  const normalizedSubmissions = useMemo(() => submissions.map(entry => {
    const round = Number(entry.group_round)
    const reviewerKey = `${round}:${Number(entry.reviewer_number)}`
    const memberKey = `${round}:${Number(entry.member_number)}`
    const reviewerTable = tableByRoundAndPerson.get(reviewerKey) || inferredGroupByRoundAndPerson.get(reviewerKey)
    const memberTable = tableByRoundAndPerson.get(memberKey) || inferredGroupByRoundAndPerson.get(memberKey)
    const table = reviewerTable || memberTable || "غير معروف"
    return { ...entry, __table: table, __groupKey: `${round}:${table}` }
  }), [submissions, tableByRoundAndPerson, inferredGroupByRoundAndPerson])

  const groups = useMemo<GroupInsight[]>(() => {
    const keys = new Set<string>()
    for (const round of [1, 2]) {
      const tables = seating?.[round] || {}
      for (const table of Object.keys(tables)) keys.add(`${round}:${table}`)
    }
    normalizedSubmissions.forEach((entry: any) => keys.add(entry.__groupKey))

    return Array.from(keys)
      .map(key => {
        const [roundRaw, ...tableParts] = key.split(":")
        const round = Number(roundRaw)
        const table = tableParts.join(":") || "?"
        const members: SeatingMember[] = Array.isArray(seating?.[round]?.[table]) ? seating[round][table] : []
        const entries = normalizedSubmissions.filter((entry: any) => entry.__groupKey === key)
        const stats = buildRoundStats(entries)
        const tags = new Map<string, number>()
        entries.forEach(entry => (entry.tags || []).forEach(tag => tags.set(tag, (tags.get(tag) || 0) + 1)))
        const commonTags = sortTags(tags)

        const negativeTargets = new Map<number, { name: string; count: number }>()
        entries.filter(isNegative).forEach(entry => {
          const number = Number(entry.member_number)
          const current = negativeTargets.get(number) || { name: entry.member_name || `#${number}`, count: 0 }
          current.count += 1
          negativeTargets.set(number, current)
        })
        const topNegative = Array.from(negativeTargets.entries()).sort((a, b) => b[1].count - a[1].count)[0]
        const dominantNegativeTarget = topNegative && stats.negative > 0 && topNegative[1].count / stats.negative >= 0.5
          ? { number: topNegative[0], name: topNegative[1].name, count: topNegative[1].count, share: topNegative[1].count / stats.negative }
          : null

        return {
          key,
          round,
          table,
          members,
          submissions: entries,
          reviews: stats.reviews,
          average: stats.average,
          positive: stats.positive,
          neutral: stats.neutral,
          negative: stats.negative,
          positiveRate: stats.positiveRate,
          neutralRate: stats.neutralRate,
          negativeRate: stats.negativeRate,
          commonTags,
          commonPositiveTags: commonTags.filter(([tag]) => POSITIVE_TAGS.has(tag)),
          commonNegativeTags: commonTags.filter(([tag]) => NEGATIVE_TAGS.has(tag)),
          dominantNegativeTarget,
        }
      })
      .filter(group => group.reviews > 0 || group.members.length > 0)
      .sort((a, b) => a.round - b.round || Number(a.table) - Number(b.table))
  }, [normalizedSubmissions, seating])

  const people = useMemo<PersonInsight[]>(() => {
    const byNumber = new Map<number, GroupMemberFeedbackSubmission[]>()
    normalizedSubmissions.forEach(entry => {
      const number = Number(entry.member_number)
      if (!byNumber.has(number)) byNumber.set(number, [])
      byNumber.get(number)!.push(entry)
    })

    const rankingCurrent = new Map((dislikeRankings?.event || []).map(entry => [Number(entry.number), entry]))
    const rankingOverall = new Map((dislikeRankings?.overall || []).map(entry => [Number(entry.number), entry]))

    return Array.from(byNumber.entries()).map(([number, entries]) => {
      const stats = buildRoundStats(entries)
      const polarizingScore = Math.min(stats.positiveRate, stats.negativeRate) * (stats.positiveRate + stats.negativeRate) * 100

      const tags = new Map<string, number>()
      entries.forEach(entry => (entry.tags || []).forEach(tag => tags.set(tag, (tags.get(tag) || 0) + 1)))
      const tagCounts = sortTags(tags)
      const positiveTags = tagCounts.filter(([tag]) => POSITIVE_TAGS.has(tag))
      const negativeTags = tagCounts.filter(([tag]) => NEGATIVE_TAGS.has(tag))
      const neutralTags = tagCounts.filter(([tag]) => NEUTRAL_TAGS.has(tag) || (!POSITIVE_TAGS.has(tag) && !NEGATIVE_TAGS.has(tag)))

      const roundBreakdown: Record<number, RoundStats> = {
        1: buildRoundStats(entries.filter(entry => Number(entry.group_round) === 1)),
        2: buildRoundStats(entries.filter(entry => Number(entry.group_round) === 2)),
      }
      const reviewedRounds = [1, 2].filter(round => roundBreakdown[round].reviews > 0).length
      const negativeRounds = [1, 2].filter(round => roundBreakdown[round].reviews >= 2 && roundBreakdown[round].average < 2.5).length
      const positiveRounds = [1, 2].filter(round => roundBreakdown[round].reviews >= 2 && roundBreakdown[round].average >= 3).length

      const base: Omit<PersonInsight, "summaryText"> = {
        number,
        name: personName(entries[0], number),
        reviews: stats.reviews,
        scoreTotal: stats.scoreTotal,
        average: stats.average,
        positive: stats.positive,
        neutral: stats.neutral,
        negative: stats.negative,
        positiveRate: stats.positiveRate,
        neutralRate: stats.neutralRate,
        negativeRate: stats.negativeRate,
        confidenceLabel: confidenceLabel(stats.reviews),
        polarizingScore,
        tagCounts,
        positiveTags,
        negativeTags,
        neutralTags,
        roundBreakdown,
        reviewedRounds,
        negativeRounds,
        positiveRounds,
        notes: entries.filter(entry => Boolean(entry.organizer_note)),
        submissions: entries,
        historyCurrent: rankingCurrent.get(number),
        historyOverall: rankingOverall.get(number),
      }
      return { ...base, summaryText: makeSummaryText(base) }
    })
  }, [normalizedSubmissions, dislikeRankings])

  const peopleByNumber = useMemo(() => new Map(people.map(person => [person.number, person])), [people])

  const highestRated = useMemo(() => [...people].sort((a, b) => b.average - a.average || b.reviews - a.reviews || a.number - b.number)[0], [people])
  const lowestRated = useMemo(() => [...people].sort((a, b) => a.average - b.average || b.reviews - a.reviews || b.negativeRate - a.negativeRate || a.number - b.number)[0], [people])
  const mostPolarizing = useMemo(() => [...people].filter(person => person.positive > 0 && person.negative > 0).sort((a, b) => b.polarizingScore - a.polarizingScore || b.reviews - a.reviews)[0], [people])
  const biggestImprovement = useMemo(() => [...people]
    .filter(person => person.roundBreakdown[1]?.reviews >= 2 && person.roundBreakdown[2]?.reviews >= 2)
    .map(person => ({ person, delta: person.roundBreakdown[2].average - person.roundBreakdown[1].average }))
    .filter(item => item.delta > 0.15)
    .sort((a, b) => b.delta - a.delta || b.person.reviews - a.person.reviews)[0], [people])
  const recurringConcern = useMemo(() => {
    const repeatedInsideEvent = [...people]
      .filter(person => person.negativeRounds >= 2)
      .sort((a, b) => a.average - b.average || b.reviews - a.reviews)[0]
    if (repeatedInsideEvent) return { person: repeatedInsideEvent, source: "متوسط أقل من 2.5 في الجولتين" }
    const corroborated = [...people]
      .filter(person => person.negative > 0 && Number(person.historyOverall?.events_count || 0) >= 2)
      .map(person => ({ person, historyGap: Number(person.historyOverall?.dislike_score || 0) - Number(person.historyOverall?.like_score || 0) }))
      .filter(item => item.historyGap > 8)
      .sort((a, b) => b.historyGap - a.historyGap || a.person.average - b.person.average)[0]
    return corroborated ? { person: corroborated.person, source: `وتدعمه ترتيبات ${corroborated.person.historyOverall?.events_count || 0} فعاليات` } : null
  }, [people])

  const filteredPeople = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let rows = people.filter(person => !needle || person.name.toLowerCase().includes(needle) || String(person.number).includes(needle))
    if (view === "polarizing") rows = rows.filter(person => person.positive > 0 && person.negative > 0)

    if (view === "negative") return [...rows].sort((a, b) => a.average - b.average || b.reviews - a.reviews || b.negativeRate - a.negativeRate || a.number - b.number)
    if (view === "polarizing") return [...rows].sort((a, b) => b.polarizingScore - a.polarizingScore || b.reviews - a.reviews || a.number - b.number)
    return [...rows].sort((a, b) => b.average - a.average || b.reviews - a.reviews || a.number - b.number)
  }, [people, query, view])

  const filteredRaw = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return normalizedSubmissions.filter(entry => {
      if (roundFilter !== "all" && String(entry.group_round) !== roundFilter) return false
      if (!needle) return true
      return [entry.reviewer_name, entry.member_name, entry.reviewer_number, entry.member_number, entry.organizer_note, ...(entry.tags || [])]
        .some(value => String(value || "").toLowerCase().includes(needle))
    })
  }, [normalizedSubmissions, query, roundFilter])

  const filteredNotePeople = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return people
      .map(person => {
        const personMatches = !needle || person.name.toLowerCase().includes(needle) || String(person.number).includes(needle)
        const notes = person.notes.filter(entry => {
          if (roundFilter !== "all" && String(entry.group_round) !== roundFilter) return false
          if (personMatches) return true
          return [entry.reviewer_name, entry.reviewer_number, entry.organizer_note]
            .some(value => String(value || "").toLowerCase().includes(needle))
        })
        return { person, notes }
      })
      .filter(item => item.notes.length > 0)
      .sort((a, b) => b.notes.length - a.notes.length || a.person.average - b.person.average || a.person.number - b.person.number)
  }, [people, query, roundFilter])

  const reviewerCount = Number(data?.reviewer_count) || new Set(normalizedSubmissions.map(entry => Number(entry.reviewer_number))).size
  const participantCount = Number(data?.participant_count) || Math.max(people.length, 0)
  const responseRate = participantCount > 0 ? Math.min(1, reviewerCount / participantCount) : 0
  const notesCount = normalizedSubmissions.filter(entry => Boolean(entry.organizer_note)).length
  const effectiveEventId = eventId ?? data?.event_id ?? null

  if (!normalizedSubmissions.length) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-8 text-center">
        <MessageSquare className="mx-auto h-8 w-8 text-slate-600" />
        <h3 className="mt-3 text-lg font-black text-white">لا توجد تقييمات مجموعات بعد</h3>
        <p className="mt-1 text-sm text-slate-500">عندما تصل التقييمات سيظهر الترتيب بالمتوسط، وتوزيع الإجابات، والملاحظات، وتحليل كل مجموعة.</p>
      </div>
    )
  }

  const viewTabs: Array<{ id: ViewMode; label: string }> = [
    { id: "all", label: "الترتيب العام" },
    { id: "negative", label: "الأقل تقييمًا" },
    { id: "polarizing", label: "تباين الآراء" },
    { id: "groups", label: "المجموعات" },
    { id: "notes", label: `ملاحظات المنظم (${notesCount})` },
    { id: "raw", label: "سجل التقييمات" },
  ]

  return (
    <div dir="rtl" className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-indigo-400/15 bg-gradient-to-br from-indigo-950/50 via-slate-950/90 to-slate-950/90">
        <div className="border-b border-white/10 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-xl border border-indigo-400/20 bg-indigo-400/10 p-2 text-indigo-200"><Sparkles className="h-4 w-4" /></span>
                <h2 className="text-xl font-black text-white">تحليل تقييمات المجموعات</h2>
                {effectiveEventId != null ? <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-slate-400">فعالية #{effectiveEventId}</span> : null}
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">ترتيب واضح مبني على متوسط التقييم الفعلي من 4، مع عرض حجم العينة والأسباب والملاحظات دون خلطها بدرجات تقديرية.</p>
            </div>
            <button type="button" onClick={() => setShowScoringInfo(value => !value)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/10">
              <Eye className="h-3.5 w-3.5" /> كيف نقرأ النتائج؟ <ChevronDown className={`h-3.5 w-3.5 transition ${showScoringInfo ? "rotate-180" : ""}`} />
            </button>
          </div>

          {showScoringInfo ? (
            <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-slate-400 md:grid-cols-3">
              <div><strong className="block text-slate-200">الترتيب بالمتوسط الفعلي</strong>ممتازة = 4، جيدة = 3، محايدة = 2، غير مريحة = 1. الأعلى تقييمًا يرتب تنازليًا، والأقل تقييمًا يرتب تصاعديًا.</div>
              <div><strong className="block text-slate-200">النسب كما أُرسلت</strong>الإيجابي يجمع «ممتازة» و«جيدة»، والمحايد يبقى منفصلًا، والسلبي هو «غير مريحة» فقط.</div>
              <div><strong className="block text-slate-200">حجم العينة للسياق</strong>عدد التقييمات لا يغير المتوسط أو ترتيب التبويب، لكنه يوضح إن كانت النتيجة مبنية على عينة صغيرة أم جيدة.</div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
          <div className="bg-slate-950/80 p-4"><div className="text-[10px] font-bold text-slate-500">مشاركون قيّموا</div><div className="mt-1 text-xl font-black text-white">{reviewerCount}<span className="text-xs font-medium text-slate-600">/{participantCount || "—"}</span></div><div className="text-[10px] text-slate-500">مشاركة {participantCount ? pct(responseRate) : "—"}</div></div>
          <div className="bg-slate-950/80 p-4"><div className="text-[10px] font-bold text-slate-500">إجمالي التقييمات</div><div className="mt-1 text-xl font-black text-white">{normalizedSubmissions.length}</div><div className="text-[10px] text-slate-500">متوسط {globalStats.average.toFixed(2)}/4</div></div>
          <div className="bg-slate-950/80 p-4"><div className="text-[10px] font-bold text-slate-500">الإيجابي الفعلي</div><div className="mt-1 text-xl font-black text-emerald-300">{pct(globalStats.positiveRate)}</div><div className="text-[10px] text-slate-500">ممتازة أو جيدة</div></div>
          <button type="button" onClick={() => setView("notes")} className="bg-slate-950/80 p-4 text-right transition hover:bg-slate-900"><div className="text-[10px] font-bold text-slate-500">ملاحظات المنظم</div><div className="mt-1 text-xl font-black text-white">{notesCount}</div><div className="text-[10px] text-amber-300/70">افتح تبويب الملاحظات</div></button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          icon={<Heart className="h-4 w-4" />}
          label="أعلى متوسط"
          primary={highestRated ? `${highestRated.name} #${highestRated.number}` : "—"}
          secondary={highestRated ? `${highestRated.average.toFixed(2)}/4 · ${reviewCountLabel(highestRated.reviews)}` : undefined}
          tertiary={highestRated?.positiveTags.slice(0, 2).map(([tag]) => humanTag(tag)).join(" · ") || highestRated?.summaryText}
          onClick={highestRated ? () => setSelectedPerson(highestRated) : undefined}
        />
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="أقل متوسط"
          primary={lowestRated ? `${lowestRated.name} #${lowestRated.number}` : "—"}
          secondary={lowestRated ? `${lowestRated.average.toFixed(2)}/4 · سلبي ${pct(lowestRated.negativeRate)}` : undefined}
          tertiary={lowestRated?.negativeTags.slice(0, 2).map(([tag]) => humanTag(tag)).join(" · ") || lowestRated?.summaryText}
          onClick={lowestRated ? () => setSelectedPerson(lowestRated) : undefined}
        />
        <MetricCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="الأكثر انقسامًا"
          primary={mostPolarizing ? `${mostPolarizing.name} #${mostPolarizing.number}` : "لا يوجد انقسام واضح"}
          secondary={mostPolarizing ? `إيجابي ${pct(mostPolarizing.positiveRate)} · سلبي ${pct(mostPolarizing.negativeRate)}` : undefined}
          tertiary={mostPolarizing?.summaryText}
          onClick={mostPolarizing ? () => setSelectedPerson(mostPolarizing) : undefined}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <MetricCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="أكبر تحسن بين الجولتين"
          primary={biggestImprovement ? `${biggestImprovement.person.name} #${biggestImprovement.person.number}` : "لا يوجد تغير واضح"}
          secondary={biggestImprovement ? `+${biggestImprovement.delta.toFixed(2)} نقطة من الجولة 1 إلى 2` : undefined}
          tertiary={biggestImprovement ? `${biggestImprovement.person.roundBreakdown[1].average.toFixed(2)} ← ${biggestImprovement.person.roundBreakdown[2].average.toFixed(2)} · بتقييمين على الأقل في كل جولة` : "نحتاج تقييمين على الأقل في كل جولة لنقيس التحسن."}
          onClick={biggestImprovement ? () => setSelectedPerson(biggestImprovement.person) : undefined}
        />
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="متوسط منخفض متكرر"
          primary={recurringConcern ? `${recurringConcern.person.name} #${recurringConcern.person.number}` : "لا يوجد نمط متكرر"}
          secondary={recurringConcern?.source}
          tertiary={recurringConcern?.person.summaryText || "يظهر فقط عندما يكون المتوسط منخفضًا في الجولتين أو تدعمه بيانات من فعاليات سابقة."}
          onClick={recurringConcern ? () => setSelectedPerson(recurringConcern.person) : undefined}
        />
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-950/60">
        <div className="border-b border-white/10 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {viewTabs.map(tab => (
                <button key={tab.id} type="button" onClick={() => setView(tab.id)} className={`whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition ${view === tab.id ? "border-indigo-400/30 bg-indigo-400/15 text-indigo-100" : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"}`}>
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row xl:justify-end">
              {view !== "groups" ? (
                <div className="relative min-w-0 sm:w-72">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  <input value={query} onChange={(event: any) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الرقم..." className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-3 pr-9 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/30" />
                </div>
              ) : null}
            </div>
          </div>
          {RANKING_HELP[view] ? <p className="mt-2 text-[11px] text-slate-500">{RANKING_HELP[view]}</p> : null}
        </div>

        {view === "groups" ? (
          <div className="p-4 sm:p-5">
            <div className="mb-4">
              <h3 className="text-base font-black text-white">تشخيص المجموعات</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">المجموعات مرتبة من الأقل متوسطًا إلى الأعلى حتى تظهر المجموعات التي تحتاج مراجعة أولًا.</p>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {[...groups].sort((a, b) => a.average - b.average || b.reviews - a.reviews).map(group => <GroupCard key={group.key} group={group} peopleByNumber={peopleByNumber} onPerson={setSelectedPerson} />)}
            </div>
          </div>
        ) : view === "notes" ? (
          <div className="p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white">ملاحظات المنظم حسب المشارك</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">كل ملاحظة تظهر هنا وداخل صفحة المشارك. اضغط على أي بطاقة لفتح تحليله الكامل.</p>
              </div>
              <div className="flex gap-1.5">
                {(["all", "1", "2"] as const).map(round => <button key={round} type="button" onClick={() => setRoundFilter(round)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${roundFilter === round ? "border-amber-400/30 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/5 text-slate-500"}`}>{round === "all" ? "كل الجولات" : `الجولة ${round}`}</button>)}
              </div>
            </div>
            <div className="space-y-3">
              {filteredNotePeople.map(({ person, notes }) => (
                <button key={person.number} type="button" onClick={() => setSelectedPerson(person)} className="w-full rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-4 text-right transition hover:border-amber-400/25 hover:bg-amber-400/[0.07]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><span className="font-black text-white">{person.name}</span><span className="text-xs text-slate-500">#{person.number}</span><span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black text-amber-200">{noteCountLabel(notes.length)}</span></div>
                      <div className="mt-1 text-[11px] text-slate-500">متوسط {person.average.toFixed(2)}/4 · {reviewCountLabel(person.reviews)}</div>
                    </div>
                    <span className="text-[10px] font-bold text-amber-300">فتح تفاصيل المشارك</span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {notes.map((entry, index) => (
                      <div key={`${entry.reviewer_number}-${entry.group_round}-${index}`} className="rounded-xl border border-amber-400/15 bg-black/20 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-amber-200/55"><span>من {entry.reviewer_name || `#${entry.reviewer_number}`} · #{entry.reviewer_number}</span><span>الجولة {entry.group_round}</span></div>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-amber-50">{entry.organizer_note}</p>
                      </div>
                    ))}
                  </div>
                </button>
              ))}
              {!filteredNotePeople.length ? <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-xs text-slate-600">لا توجد ملاحظات تطابق البحث أو الجولة المختارة.</div> : null}
            </div>
          </div>
        ) : view === "raw" ? (
          <div className="p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white">سجل التقييمات</h3>
                <p className="mt-1 text-xs text-slate-500">كل تقييم كما أُرسل، للتدقيق عند الحاجة.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "1", "2"] as const).map(round => <button key={round} type="button" onClick={() => setRoundFilter(round)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${roundFilter === round ? "border-indigo-400/30 bg-indigo-400/15 text-indigo-100" : "border-white/10 bg-white/5 text-slate-500"}`}>{round === "all" ? "كل الجولات" : `الجولة ${round}`}</button>)}
              </div>
            </div>
            <div className="space-y-2">
              {filteredRaw.map((entry: any, index) => (
                <button key={`${entry.reviewer_number}-${entry.member_number}-${entry.group_round}-${index}`} type="button" onClick={() => { const person = peopleByNumber.get(Number(entry.member_number)); if (person) setSelectedPerson(person) }} className="w-full rounded-2xl border border-white/10 bg-black/15 p-4 text-right hover:bg-white/[0.03]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-bold text-slate-200"><span className="text-slate-500">{entry.reviewer_name || `#${entry.reviewer_number}`} →</span> {entry.member_name || `#${entry.member_number}`} <span className="text-xs font-medium text-slate-600">#{entry.member_number}</span></div>
                    <div className="flex items-center gap-2 text-[10px]"><span className="text-slate-500">ج{entry.group_round} · ط{entry.__table}</span><span className={`rounded-full px-2 py-1 font-bold ${isPositive(entry) ? "bg-emerald-400/10 text-emerald-300" : isNegative(entry) ? "bg-rose-400/10 text-rose-300" : "bg-slate-400/10 text-slate-300"}`}>{EXPERIENCE_LABELS[String(entry.experience || "")] || entry.experience || "—"}</span></div>
                  </div>
                  {entry.tags?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{entry.tags.map((tag: string) => <TagPill key={tag} tag={tag} tone={POSITIVE_TAGS.has(tag) ? "positive" : NEGATIVE_TAGS.has(tag) ? "negative" : "neutral"} />)}</div> : null}
                  {entry.organizer_note ? <div className="mt-2 rounded-xl border border-amber-400/15 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-amber-100">{entry.organizer_note}</div> : null}
                </button>
              ))}
              {!filteredRaw.length ? <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-slate-600">لا توجد تقييمات تطابق البحث أو الفلاتر الحالية.</div> : null}
            </div>
          </div>
        ) : (
          <div className="p-0 sm:p-4">
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[860px] border-separate border-spacing-y-2 text-right">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-500">
                    <th className="px-3 py-2">الترتيب</th>
                    <th className="px-3 py-2">المشارك</th>
                    <th className="px-3 py-2">المتوسط الفعلي</th>
                    <th className="px-3 py-2">توزيع التقييمات</th>
                    <th className="px-3 py-2">التقييمات</th>
                    <th className="px-3 py-2">السبب والملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPeople.map((person, index) => {
                    const mainPositive = person.positiveTags[0]
                    const mainNegative = person.negativeTags[0]
                    return (
                      <tr key={person.number} onClick={() => setSelectedPerson(person)} className="cursor-pointer bg-white/[0.025] text-sm transition hover:bg-white/[0.05]">
                        <td className="rounded-r-2xl px-3 py-3 font-black text-slate-600">{index + 1}</td>
                        <td className="px-3 py-3"><div className="font-black text-white">{person.name}</div><div className="text-[10px] text-slate-600">#{person.number} · {person.confidenceLabel}</div>{person.notes.length ? <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-400/15 bg-amber-400/5 px-2 py-0.5 text-[9px] font-bold text-amber-300"><MessageSquare className="h-2.5 w-2.5" /> {noteCountLabel(person.notes.length)}</div> : null}</td>
                        <td className="px-3 py-3"><div className={`text-lg font-black ${person.average < 2.5 ? "text-rose-300" : person.average >= 3.25 ? "text-emerald-300" : "text-white"}`}>{person.average.toFixed(2)}<span className="text-[10px] font-medium text-slate-600">/4</span></div><div className="text-[9px] text-slate-500">{averageLabel(person.average)}</div></td>
                        <td className="w-52 px-3 py-3"><SegmentedBar positive={person.positive} neutral={person.neutral} negative={person.negative} /><div className="mt-1 flex justify-between gap-2 text-[9px] font-bold"><span className="text-emerald-300">إيجابي {pct(person.positiveRate)}</span><span className="text-slate-500">محايد {pct(person.neutralRate)}</span><span className="text-rose-300">سلبي {pct(person.negativeRate)}</span></div></td>
                        <td className="px-3 py-3"><div className="font-bold text-slate-300">{person.reviews}</div><div className="text-[9px] text-slate-600">{person.reviewedRounds}/2 جولات</div></td>
                        <td className="max-w-[260px] rounded-l-2xl px-3 py-3"><div className="flex flex-wrap gap-1">{mainPositive ? <TagPill tag={mainPositive[0]} count={mainPositive[1]} tone="positive" /> : null}{mainNegative ? <TagPill tag={mainNegative[0]} count={mainNegative[1]} tone="negative" /> : null}</div><div className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-600">{person.summaryText}</div>{person.notes.length ? <div className="mt-1 text-[9px] font-bold text-amber-300">اضغط لعرض {noteCountLabel(person.notes.length)}</div> : null}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-white/5 sm:hidden">
              {filteredPeople.map((person, index) => (
                <button key={person.number} type="button" onClick={() => setSelectedPerson(person)} className="w-full p-4 text-right hover:bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="flex items-center gap-2"><span className="text-xs font-black text-slate-600">{index + 1}</span><span className="truncate font-black text-white">{person.name}</span><span className="text-xs text-slate-600">#{person.number}</span></div><div className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">{person.summaryText}</div>{person.notes.length ? <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-amber-300"><MessageSquare className="h-3 w-3" /> {noteCountLabel(person.notes.length)}</div> : null}</div>
                    <div className="shrink-0 text-left"><div className={`text-lg font-black ${person.average < 2.5 ? "text-rose-300" : person.average >= 3.25 ? "text-emerald-300" : "text-white"}`}>{person.average.toFixed(2)}<span className="text-[10px] text-slate-600">/4</span></div><ConfidenceBadge reviews={person.reviews} /></div>
                  </div>
                  <div className="mt-3"><SegmentedBar positive={person.positive} neutral={person.neutral} negative={person.negative} /></div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold"><span className="text-emerald-300">إيجابي {pct(person.positiveRate)}</span><span className="text-slate-500">محايد {pct(person.neutralRate)}</span><span className="text-rose-300">سلبي {pct(person.negativeRate)}</span><span className="text-slate-500">{reviewCountLabel(person.reviews)}</span></div>
                  {(person.positiveTags[0] || person.negativeTags[0]) ? <div className="mt-2 flex flex-wrap gap-1.5">{person.positiveTags[0] ? <TagPill tag={person.positiveTags[0][0]} count={person.positiveTags[0][1]} tone="positive" /> : null}{person.negativeTags[0] ? <TagPill tag={person.negativeTags[0][0]} count={person.negativeTags[0][1]} tone="negative" /> : null}</div> : null}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-[11px] leading-5 text-slate-500">
        <strong className="text-slate-300">مهم:</strong> المتوسط يلخص التقييمات ولا يفسرها وحده. راجع حجم العينة، الأسباب، وملاحظات المنظم داخل صفحة المشارك قبل اتخاذ أي قرار.
      </div>

      {selectedPerson ? <PersonDetailModal person={selectedPerson} onClose={() => setSelectedPerson(null)} /> : null}
    </div>
  )
}
