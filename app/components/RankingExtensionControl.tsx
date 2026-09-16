import { useState } from "react"
import { Clock3, Loader2 } from "lucide-react"

export default function RankingExtensionControl({ name, extension, disabled, onGrant }: {
  name: string
  extension?: { expires_at: string } | null
  disabled?: boolean
  onGrant: (seconds: number) => Promise<void>
}) {
  const [seconds, setSeconds] = useState(120)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  return <div className="mt-3 space-y-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] p-3" dir="rtl">
    <p className="flex items-center gap-2 text-xs font-bold text-cyan-100"><Clock3 size={14} /> وقت إضافي لإعادة الترتيب</p>
    <p className="text-[11px] leading-5 text-slate-400">يفتح الترتيب لهذا الشخص فقط. بعد الإرسال يرجع للمرحلة الحالية مع الجميع. اللقاءات التي تم توليدها لا تتغير تلقائياً.</p>
    {extension && <p className="text-[11px] text-cyan-200">المهلة مفتوحة حتى {new Date(extension.expires_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</p>}
    <div className="flex flex-wrap gap-2">
      <select aria-label={`مدة إضافية لـ ${name}`} value={seconds} disabled={disabled || busy} onChange={e => setSeconds(Number(e.target.value))} className="min-h-11 rounded-lg border border-white/10 bg-slate-900 px-2 text-xs text-white">
        <option value={60}>دقيقة</option><option value={120}>دقيقتان</option><option value={180}>٣ دقائق</option><option value={300}>٥ دقائق</option>
      </select>
      <button type="button" disabled={disabled || busy} onClick={async () => {
        setBusy(true); setError("")
        try { await onGrant(seconds) } catch (err) { setError(err instanceof Error ? err.message : "تعذّر منح الوقت الإضافي") }
        finally { setBusy(false) }
      }} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-300/15 px-3 text-xs font-bold text-cyan-100 disabled:opacity-40">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Clock3 size={14} />}{extension ? "إضافة وقت" : "فتح الترتيب مجدداً"}
      </button>
    </div>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </div>
}
