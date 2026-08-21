import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  CheckCircle2,
  Eye,
  Heart,
  Loader2,
  Lock,
  ShieldAlert,
  X,
} from "lucide-react"
import { HistoryConfidenceBadges } from "./HistoryConfidenceBadge"
import { getPersonName, type MatchControlPair, type MatchControlPerson } from "~/lib/matchControl"

export type HistoryReviewType = "lock" | "review" | "exclude"

export type HistoryReviewItem = {
  id: string
  type: HistoryReviewType
  pair: MatchControlPair
  pairData: any
}

type Props = {
  items: HistoryReviewItem[]
  people: Map<number, MatchControlPerson>
  isTestMode: boolean
  busyAction: string | null
  onClose: () => void
  onOpenAnalysis: (item: HistoryReviewItem) => void
  onConfirmLock: (item: HistoryReviewItem) => void
  onConfirmExclude: (item: HistoryReviewItem) => void
  onDismiss: (item: HistoryReviewItem) => void
}

const meta: Record<HistoryReviewType, { title: string; short: string; detail: string; className: string; icon: any }> = {
  lock: {
    title: "تثبيت مقترح",
    short: "تثبيت",
    detail: "اهتمام إيجابي متبادل مع ثقة تاريخية كافية.",
    className: "border-emerald-400/25 bg-emerald-500/[0.07] text-emerald-200",
    icon: Heart,
  },
  review: {
    title: "مراجعة موصى بها",
    short: "مراجعة",
    detail: "اهتمام غير متوازن أو إشارات متعارضة بين الطرفين.",
    className: "border-amber-400/25 bg-amber-500/[0.07] text-amber-200",
    icon: AlertTriangle,
  },
  exclude: {
    title: "استبعاد مقترح",
    short: "استبعاد",
    detail: "أدلة سلبية تؤكدها أكثر من إشارة؛ لا يُنشأ الاستبعاد دون موافقتك.",
    className: "border-red-400/25 bg-red-500/[0.07] text-red-200",
    icon: Ban,
  },
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export default function HistoryReviewQueue({
  items,
  people,
  isTestMode,
  busyAction,
  onClose,
  onOpenAnalysis,
  onConfirmLock,
  onConfirmExclude,
  onDismiss,
}: Props) {
  const counts = {
    lock: items.filter(item => item.type === "lock").length,
    review: items.filter(item => item.type === "review").length,
    exclude: items.filter(item => item.type === "exclude").length,
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-0 backdrop-blur-md sm:p-4" dir="rtl">
      <div className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-[#080d18] shadow-2xl sm:h-[92dvh] sm:rounded-[28px] sm:border sm:border-white/10">
        <header className="shrink-0 border-b border-white/10 bg-gradient-to-l from-cyan-500/10 via-transparent to-amber-500/10 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-200"><ShieldAlert className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-black text-white sm:text-xl">طابور مراجعة الثقة التاريخية</h3>
              <p className="mt-1 text-[11px] leading-5 text-slate-400">هذه اقتراحات فقط. التثبيت والاستبعاد لا يصبحان دائمين إلا بعد أن تراجعهما وتؤكدهما هنا.</p>
            </div>
            <button onClick={onClose} aria-label="إغلاق" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(["lock", "review", "exclude"] as HistoryReviewType[]).map(type => {
              const itemMeta = meta[type]
              const Icon = itemMeta.icon
              return <div key={type} className={`rounded-xl border p-2.5 ${itemMeta.className}`}><div className="flex items-center gap-1 text-[10px] font-bold"><Icon className="h-3.5 w-3.5" />{itemMeta.title}</div><p className="mt-1 text-xl font-black text-white">{counts[type]}</p></div>
            })}
          </div>
        </header>

        <main className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-5">
          {!items.length && (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 p-8 text-center">
              <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-400/60" />
              <p className="font-black text-white">لا توجد اقتراحات معلّقة</p>
              <p className="mt-1 max-w-md text-xs leading-6 text-slate-500">أعد تشغيل المطابقة لإعادة إنشاء الاقتراحات من أحدث الترتيبات والتقييمات.</p>
            </div>
          )}
          {items.map(item => {
            const itemMeta = meta[item.type]
            const Icon = itemMeta.icon
            const pair = item.pair
            const data = item.pairData || {}
            const aDirection = finite(data.history_direction_a_to_b?.score)
            const bDirection = finite(data.history_direction_b_to_a?.score)
            const sourceA = Number(data.participant_a || pair.a)
            const sourceB = Number(data.participant_b || pair.b)
            const confidence = finite(data.combined_history_confidence)
            const reliability = finite(data.historical_evidence?.average_rater_reliability)
            const busy = busyAction === `${item.type === "exclude" ? "exclude" : "lock"}-${pair.key}`
            return (
              <article key={item.id} className={`rounded-2xl border p-3 sm:p-4 ${itemMeta.className}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-current/20 bg-black/15 px-2 py-1 text-[10px] font-black"><Icon className="h-3 w-3" />{itemMeta.title}</span>
                      <HistoryConfidenceBadges pair={data} />
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm font-black text-white sm:text-base">
                      <span className="min-w-0 truncate">#{pair.a} {getPersonName(people.get(pair.a), pair.a)}</span>
                      <ArrowLeftRight className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="min-w-0 truncate">#{pair.b} {pair.b == null ? "—" : getPersonName(people.get(pair.b), pair.b)}</span>
                    </div>
                    <p className="mt-2 text-[10px] leading-5 text-slate-300">{data.history_review_reason || itemMeta.detail}</p>
                  </div>
                  <div className="grid shrink-0 grid-cols-2 gap-1.5 text-center text-[9px] sm:grid-cols-4">
                    <Metric label="التوافق" value={`${Math.round(Number(data.compatibility_score ?? pair.score ?? 0))}%`} />
                    <Metric label={`رأي #${sourceA} في #${sourceB}`} value={aDirection == null ? "—" : `${Math.round(aDirection)}%`} />
                    <Metric label={`رأي #${sourceB} في #${sourceA}`} value={bDirection == null ? "—" : `${Math.round(bDirection)}%`} />
                    <Metric label="ثقة / موثوقية" value={`${confidence == null ? "—" : Math.round(confidence)} / ${reliability == null ? "—" : Math.round(reliability)}%`} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-white/8 pt-3">
                  <button onClick={() => onOpenAnalysis(item)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black text-slate-200 hover:bg-white/10"><Eye className="h-3.5 w-3.5" />فتح تحليل الزوج</button>
                  <button onClick={() => onDismiss(item)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black text-slate-400 hover:bg-white/10 hover:text-white"><CheckCircle2 className="h-3.5 w-3.5" />تمت المراجعة</button>
                  {item.type === "lock" && <button onClick={() => onConfirmLock(item)} disabled={isTestMode || busy} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-[10px] font-black text-emerald-950 disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}مراجعة ثم تثبيت</button>}
                  {item.type === "exclude" && <button onClick={() => onConfirmExclude(item)} disabled={isTestMode || busy} className="inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}مراجعة ثم استبعاد</button>}
                </div>
              </article>
            )
          })}
        </main>

        <footer className="flex shrink-0 items-center gap-2 border-t border-white/8 bg-black/20 px-4 py-3 text-[10px] text-slate-500">
          <ShieldAlert className="h-3.5 w-3.5 text-cyan-300" /> التوقعات تساعد المنظّم ولا تستبدل قراره. زر «تمت المراجعة» يخفي الاقتراح في هذه الجلسة فقط.
        </footer>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-[74px] rounded-xl border border-white/8 bg-black/20 px-2 py-1.5"><p className="text-slate-500">{label}</p><p className="mt-0.5 font-black text-white">{value}</p></div>
}
