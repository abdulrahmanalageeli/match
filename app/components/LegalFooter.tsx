import { Link } from "react-router"
import { LEGAL_CR_NUMBER, LEGAL_DOCUMENT_VERSION, LEGAL_ENTITY_NAME, LEGAL_REGISTRATION_LABEL_AR } from "../lib/legal"

export function LegalFooter() {
  return (
    <footer dir="rtl" className="border-t border-slate-200/80 bg-white/95 px-4 py-6 text-slate-600 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="text-center text-xs leading-6 sm:text-right">
          <p className="font-black text-slate-900">{LEGAL_ENTITY_NAME}</p>
          <p>{LEGAL_REGISTRATION_LABEL_AR}: <span className="font-bold text-slate-700" dir="ltr">{LEGAL_CR_NUMBER}</span></p>
        </div>
        <nav aria-label="الروابط القانونية" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-bold">
          <Link className="transition-colors hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" to="/about">عن الفعالية</Link>
          <Link className="transition-colors hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" to="/terms">الشروط والأحكام</Link>
          <Link className="transition-colors hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" to="/privacy">إشعار الخصوصية</Link>
          <Link className="transition-colors hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" to="/privacy-request">حقوق البيانات</Link>
        </nav>
        <p className="text-[11px] font-medium text-slate-400">الإصدار {LEGAL_DOCUMENT_VERSION}</p>
      </div>
    </footer>
  )
}
