import { Link } from "react-router"
import { ShieldCheck } from "lucide-react"
import { LEGAL_CR_NUMBER, LEGAL_DOCUMENT_VERSION, LEGAL_ENTITY_NAME, LEGAL_REGISTRATION_LABEL_AR } from "../lib/legal"

export function LegalFooter() {
  const linkClassName = "rounded-xl px-3 py-2 text-xs font-bold text-slate-300 transition-all hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"

  return (
    <footer dir="rtl" className="relative overflow-hidden border-t border-white/10 bg-slate-950 px-4 py-5 text-slate-300">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-cyan-300/70 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/4 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex items-center justify-center gap-3 sm:justify-start">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-violet-500 text-slate-950 shadow-lg shadow-cyan-950/30">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0 text-center text-xs leading-5 sm:text-right">
            <p className="truncate font-black text-white">{LEGAL_ENTITY_NAME}</p>
            <p className="text-[11px] text-slate-400">
              {LEGAL_REGISTRATION_LABEL_AR}
              <span className="px-1 text-slate-600">·</span>
              <bdi className="font-bold text-slate-300" dir="ltr">{LEGAL_CR_NUMBER}</bdi>
            </p>
          </div>
        </div>

        <nav aria-label="الروابط القانونية" className="flex flex-wrap items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] p-1">
          <Link className={linkClassName} to="/about">عن الفعالية</Link>
          <Link className={linkClassName} to="/terms">الشروط والأحكام</Link>
          <Link className={linkClassName} to="/privacy">إشعار الخصوصية</Link>
          <Link className={linkClassName} to="/privacy-request">حقوق البيانات</Link>
        </nav>

        <div className="flex justify-center sm:col-span-2 lg:col-span-1 lg:justify-end">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-3 py-1.5 text-[10px] font-bold text-cyan-100/80">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.8)]" />
            وثائق قانونية محدثة
            <bdi dir="ltr" className="text-cyan-200">{LEGAL_DOCUMENT_VERSION}</bdi>
          </p>
        </div>
      </div>
    </footer>
  )
}
