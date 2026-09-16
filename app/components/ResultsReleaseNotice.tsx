import { useEffect, useState } from "react"

export default function ResultsReleaseNotice() {
  const [releaseAt, setReleaseAt] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get-results-visibility" }),
      signal: controller.signal,
    }).then(res => res.ok ? res.json() : null)
      .then(data => { if (!controller.signal.aborted) setReleaseAt(data?.results_release_at || null) })
      .catch(() => {})
    return () => controller.abort()
  }, [])
  if (!releaseAt || !Number.isFinite(Date.parse(releaseAt))) return null
  const date = new Date(releaseAt)
  const day = date.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", calendar: "gregory", day: "numeric", month: "long" })
  const time = date.toLocaleTimeString("en-US", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit", hour12: true })
  return (
    <p role="status" dir="rtl" className="col-span-full my-3 rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.06] px-4 py-3 text-center text-sm leading-7 text-cyan-100">
      تظهر النتائج على الصفحة الرئيسية الساعة <strong dir="ltr" className="inline-block whitespace-nowrap">{time}</strong> بالضبط
      {time === "12:00 AM" ? " (منتصف الليل)" : ""}، يوم {day}، بتوقيت الرياض.
    </p>
  )
}
