import { useCallback, useEffect, useState } from "react"
import { Gift, RefreshCw } from "lucide-react"

type Reward = { id: string; event_id: number; participant_number: number; name: string; reward_code: string; first_choice_count: number; is_test_mode: boolean; redeemed_at: string | null }
export default function ChoiceRewardsAdmin({ api, eventId, phase, testMode, disabled = false }: { api: (action: string, data?: any) => Promise<any>; eventId: number; phase: string; testMode: boolean; disabled?: boolean }) {
  const [rewards, setRewards] = useState<Reward[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    setError("")
    try {
      const result = await api("e3-get-choice-awards")
      if (result.error) setError(result.error)
      else setRewards(result.awards || [])
    } catch { setError("تعذّر تحميل الفائزين مؤقتاً. أعد المحاولة.") }
  }, [api, eventId, phase, testMode])
  useEffect(() => {
    void refresh()
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh() }, 15000)
    return () => clearInterval(timer)
  }, [refresh])
  return <section aria-label="الفائزون بخصم المشاركة القادمة" className="rounded-2xl border border-amber-400/20 bg-gradient-to-l from-amber-950/20 to-purple-950/20 p-4 text-right">
    <h2 className="text-sm font-bold text-amber-200"><Gift size={16} className="ml-2 inline"/> الفائزون بخصم 50% {rewards.length > 0 && `(${rewards.length})`}</h2>
    <p className="mt-3 text-xs leading-6 text-gray-400">تُحفظ الجائزة عند دخول الاستراحة لصاحب أكبر عدد من اختيارات المركز الأول. كل المتعادلين يفوزون. الخصم لمشاركة لاحقة ويُسجّل استخدامه هنا بعد تطبيقه على المبلغ.</p>
    <button onClick={() => void refresh()} className="mt-2 inline-flex min-h-10 items-center gap-2 text-xs text-amber-200"><RefreshCw size={13}/> تحديث</button>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {!error && rewards.length === 0 && <p className="py-2 text-xs text-gray-500">لا توجد هدايا مسجلة لهذه الفعالية أو خصومات سابقة غير مستخدمة.</p>}
    <div className="mt-2 space-y-2">{rewards.map(reward => <div key={reward.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/15 p-3">
      <div><p className="text-sm font-bold text-white">{reward.name} <span className="text-xs text-gray-500">#{reward.participant_number}</span></p><p className="mt-1 text-xs text-gray-400">فعالية {reward.event_id} · {reward.first_choice_count} اختيارات أولى {reward.is_test_mode ? "· تجربة فقط" : reward.redeemed_at ? "· تم الاستخدام" : "· محفوظ"}</p><p dir="ltr" className="mt-1 text-right font-mono text-xs text-amber-100">{reward.is_test_mode ? "PREVIEW" : reward.reward_code}</p></div>
      {!testMode && !reward.is_test_mode && !reward.redeemed_at && reward.event_id < eventId && <button disabled={disabled || busy !== null} onClick={async () => { setBusy(reward.id); const result = await api("e3-redeem-choice-award", { award_id: reward.id }); setBusy(null); if (result.error) setError(result.error); else await refresh() }} className="min-h-11 rounded-xl border border-amber-400/20 px-3 text-xs font-bold text-amber-200 disabled:opacity-40">{busy === reward.id ? "جارٍ الحفظ…" : "تسجيل استخدام الخصم"}</button>}
    </div>)}</div>
  </section>
}
