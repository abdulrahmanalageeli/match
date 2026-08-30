import { useEffect, useState } from "react"

type Health = { action: string; state: "pending" | "success" | "error"; at: number; status?: number }
const labels: Record<string, string> = {
  "participants": "قائمة المشاركين", "get-participant-stats": "إحصاءات المشاركين",
  "get-max-event-id": "أعلى رقم فعالية", "get-current-event-id": "الفعالية الحالية",
  "get-event-state": "حالة الفعالية", "get-event-finished": "انتهاء الفعالية",
  "get-results-visibility": "عرض النتائج", "get-registration-enabled": "حالة التسجيل",
  "get-groups-locked": "قفل المجموعات", "get-match-results-for-export": "نتائج المطابقة",
  "get-admin-results": "جلسات النتائج", "get-latest-admin-results": "آخر النتائج",
  "get-survey-change-counts": "تغييرات الاستبيان", "get-delta-cache-count": "حالة تحديث التوافق",
  "get-excluded-pairs": "الأزواج المستبعدة", "get-excluded-participants": "المشاركون المستبعدون",
  "get-group-excluded-participants": "المستبعدون من المجموعات", "get-receipt-review-queue": "مراجعة الإيصالات",
  "e3-cohost-dashboard": "الحضور والطاولات والمساعدة", "e3-cohost-rankings": "الترتيبات", "e3-cohost-attendee-details": "ملف المشارك",
  "e3-get-feedback": "تقييم اللقاءات", "e3-get-group-member-feedback": "تقييم المجموعات",
  "e3-get-notifications": "التنبيهات", "e3-get-mood-checks": "الاطمئنان",
  "get-whatsapp-inbox": "صندوق واتساب", "get-attendance-requests": "طلبات الحضور",
}
export default function AdminConnectionStatus() {
  const [health, setHealth] = useState<Record<string, Health>>({})
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const onStatus = (event: Event) => {
      const value = (event as CustomEvent<Health>).detail
      setHealth(previous => ({ ...previous, [value.action]: value.state === "pending" && previous[value.action]?.state === "error" ? previous[value.action] : value }))
    }
    window.addEventListener("admin-connection-status", onStatus)
    const timer = window.setInterval(() => setNow(Date.now()), 2000)
    return () => { window.removeEventListener("admin-connection-status", onStatus); window.clearInterval(timer) }
  }, [])
  const stale = Object.values(health).filter(item => item.state === "error" || (item.state === "pending" && now - item.at > 10_000))
  if (!stale.length) return null
  const requestErrors = stale.filter(item => item.status && item.status >= 400 && item.status < 500 && ![408, 429].includes(item.status))
  const needsLogin = requestErrors.some(item => item.status === 401)
  const onlyRequestErrors = requestErrors.length === stale.length
  return <div role="alert" dir="rtl" className="sticky top-0 z-[90] border border-amber-400/40 bg-amber-950 px-4 py-3 text-sm text-amber-100">
    <strong>{needsLogin ? "انتهت جلسة الإدارة — أعد تسجيل الدخول." : onlyRequestErrors ? "تعذّر تحميل بعض بيانات الإدارة — رفض الخادم طلبًا." : "الاتصال متأخر — بعض البيانات ليست محدثة."}</strong>
    <p className="mt-1 text-xs">{[...new Set(stale.map(item => `${labels[item.action] || item.action}${item.status ? ` (HTTP ${item.status})` : ""}`))].join(" · ")}</p>
    <p className="mt-1 text-xs">قد تكون البيانات المعروضة غير محدثة. يزول التنبيه عند نجاح تحديث البيانات المتأثرة.</p>
    <button type="button" onClick={() => window.location.reload()} className="mt-2 rounded border border-amber-400/50 px-3 py-1 text-xs hover:bg-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200">
      إعادة تحميل الصفحة
    </button>
  </div>
}
