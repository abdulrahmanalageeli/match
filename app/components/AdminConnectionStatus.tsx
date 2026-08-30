import { useEffect, useState } from "react"

type Health = { action: string; state: "pending" | "success" | "error"; at: number; status?: number }
const labels: Record<string, string> = {
  "e3-cohost-dashboard": "الحضور والطاولات والمساعدة", "e3-cohost-rankings": "الترتيبات",
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
  return <div role="alert" dir="rtl" className="sticky top-0 z-[90] border border-amber-400/40 bg-amber-950 px-4 py-3 text-sm text-amber-100">
    <strong>الاتصال متأخر — بعض البيانات ليست محدثة.</strong>
    <p className="mt-1 text-xs">{[...new Set(stale.map(item => labels[item.action] || "بيانات الإدارة"))].join(" · ")} — نحتفظ بآخر بيانات. استخدم زر التحديث لإعادة المحاولة؛ المتابعة التلقائية تستأنف عند عودة الاتصال.</p>
  </div>
}
