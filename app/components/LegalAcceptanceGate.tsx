import { useEffect, useRef, useState } from "react"
import { CheckCircle2, FileCheck2, ShieldCheck, Sparkles } from "lucide-react"
import { useLocation } from "react-router"
import { LEGAL_DOCUMENT_VERSION } from "../lib/legal"

type AcceptanceStatus = {
  accepted: boolean
  requires_acceptance: boolean
  document_bundle_version: string
}

const PARTICIPANT_PATHS = new Set(["/welcome", "/event3", "/groups", "/results"])

const UPDATE_HIGHLIGHTS = [
  { icon: ShieldCheck, title: "خصوصية أوضح", body: "بياناتك وحقوقك ومزودو المعالجة" },
  { icon: Sparkles, title: "أنواع الفعاليات", body: "شريك محدد أو اختيار فقط" },
  { icon: CheckCircle2, title: "سياسات محددة", body: "القبول والحظر والاسترداد" },
]

function getParticipantToken(search: string) {
  const urlToken = new URLSearchParams(search).get("token")?.trim()
  if (urlToken) return urlToken
  if (typeof window === "undefined") return null
  return localStorage.getItem("blindmatch_result_token")?.trim()
    || localStorage.getItem("blindmatch_returning_token")?.trim()
    || null
}

export function LegalAcceptanceGate() {
  const location = useLocation()
  const dialogRef = useRef<HTMLElement>(null)
  const [status, setStatus] = useState<AcceptanceStatus | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const shouldCheck = PARTICIPANT_PATHS.has(location.pathname)

  useEffect(() => {
    if (!shouldCheck) {
      setStatus(null)
      return
    }
    const token = getParticipantToken(location.search)
    if (!token) {
      setStatus(null)
      return
    }

    const controller = new AbortController()
    fetch("/api/participant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "legal-acceptance-status", secure_token: token }),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error("status-unavailable")
        return response.json() as Promise<AcceptanceStatus>
      })
      .then(nextStatus => setStatus(nextStatus))
      .catch(fetchError => {
        if (fetchError?.name !== "AbortError") setStatus(null)
      })
    return () => controller.abort()
  }, [location.search, shouldCheck])

  const isDialogOpen = Boolean(status?.requires_acceptance && !status.accepted)

  useEffect(() => {
    if (!isDialogOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    dialogRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isDialogOpen])

  if (!status || !isDialogOpen) return null

  const accept = async () => {
    const token = getParticipantToken(location.search)
    if (!token || !termsAccepted || !privacyAccepted) return
    setSubmitting(true)
    setError("")
    try {
      const response = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept-legal-update",
          secure_token: token,
          terms_accepted: true,
          privacy_acknowledged: true,
        }),
      })
      const result = await response.json()
      if (!response.ok || result?.accepted !== true) throw new Error(result?.error || "تعذر حفظ الموافقة")
      setStatus(current => current ? { ...current, accepted: true, requires_acceptance: false } : current)
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "تعذر حفظ الموافقة. حاول مرة أخرى.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-md sm:items-center sm:p-5" dir="rtl">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-update-title"
        tabIndex={-1}
        className="relative max-h-[94dvh] w-full overflow-y-auto rounded-t-[2rem] border border-white/10 bg-slate-950 text-white shadow-[0_32px_100px_rgba(2,6,23,.65)] sm:max-w-xl sm:rounded-[2rem]"
      >
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
        <div className="space-y-6 p-6 sm:p-8">
          <header className="space-y-3 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-300/20 to-blue-500/10 text-cyan-200 shadow-lg shadow-cyan-950/30">
              <FileCheck2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-black tracking-wide text-cyan-300">تحديث مهم · الإصدار {status.document_bundle_version || LEGAL_DOCUMENT_VERSION}</p>
              <h2 id="legal-update-title" className="mt-2 text-2xl font-black">شروط أوضح، وتجربة أكثر شفافية</h2>
            </div>
            <p className="text-sm leading-7 text-slate-300">
              حدّثنا الشروط وإشعار الخصوصية لتوضيح أنواع الفعاليات، وسياسة الاسترداد، وقرارات القبول، واستخدام أدوات الذكاء الاصطناعي.
            </p>
          </header>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {UPDATE_HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.045] p-3 sm:p-4">
                <Icon className="mb-2 h-5 w-5 text-cyan-300 sm:mb-3" aria-hidden="true" />
                <p className="text-xs font-black sm:text-sm">{title}</p>
                <p className="mt-1 hidden text-xs leading-5 text-slate-400 sm:block">{body}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <label className="flex cursor-pointer gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-cyan-300/30 hover:bg-white/[0.055]">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={event => setTermsAccepted(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-cyan-400"
              />
              <span className="text-sm leading-6 text-slate-200">
                قرأت وأوافق على <a className="font-black text-cyan-300 underline underline-offset-4" href="/terms" target="_blank" rel="noreferrer">الشروط والأحكام المحدثة</a>، بما فيها سياسات القبول والحظر وأنواع الفعاليات والاسترداد.
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-cyan-300/30 hover:bg-white/[0.055]">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={event => setPrivacyAccepted(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-cyan-400"
              />
              <span className="text-sm leading-6 text-slate-200">
                قرأت <a className="font-black text-cyan-300 underline underline-offset-4" href="/privacy" target="_blank" rel="noreferrer">إشعار الخصوصية المحدث</a> وأقر بمعرفتي بكيفية معالجة البيانات. ويمكنني أيضًا قراءة <a className="font-black text-cyan-300 underline underline-offset-4" href="/about" target="_blank" rel="noreferrer">وصف الفعالية</a>.
              </span>
            </label>
          </div>

          {error ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-center text-sm text-rose-200">{error}</p> : null}

          <button
            type="button"
            onClick={accept}
            disabled={!termsAccepted || !privacyAccepted || submitting}
            className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "جارٍ حفظ موافقتك…" : "أوافق وأتابع"}
          </button>
          <p className="text-center text-[11px] leading-5 text-slate-500">نسجل رقم المشارك، إصدار الوثائق، ووقت الموافقة لأغراض الإثبات والامتثال.</p>
        </div>
      </section>
    </div>
  )
}
