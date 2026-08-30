import { useEffect, useRef, useState, type FormEvent } from "react"
import { Download, Loader2, LogOut, RefreshCw, ShieldCheck } from "lucide-react"
import { COHOST_AGREEMENT, cohostAgreementText } from "~/lib/cohost-agreement.mjs"

type AgreementResponse = { agreement: typeof COHOST_AGREEMENT; agreement_hash: string; accepted: boolean; accepted_at: string | null }
type AgreementError = Error & { status?: number; code?: string }

async function agreementRequest<T>(token: string, action: string, signal: AbortSignal, extra: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...extra }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data || data.error) {
    throw Object.assign(new Error(data?.error || "تعذر الوصول إلى سجل التعهد. حاولي مجدداً"), { status: response.status, code: data?.code })
  }
  return data as T
}

export default function CohostConfidentialityGate({ token, onAccepted, onLogout }: {
  token: string
  onAccepted: (token: string) => void
  onLogout: (message?: string) => void
}) {
  const [data, setData] = useState<AgreementResponse | null>(null)
  const [fullName, setFullName] = useState("")
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)
  const savingRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError("")
    setData(null)
    setConsent(false)
    agreementRequest<AgreementResponse>(token, "e3-cohost-agreement", controller.signal).then(result => {
      if (controller.signal.aborted) return
      if (result.accepted) { onAccepted(token); return }
      if (!result.agreement?.sections?.length || !result.agreement_hash) throw new Error("تعذر تحميل التعهد كاملاً")
      setData(result)
    }).catch((requestError: AgreementError) => {
      if (controller.signal.aborted) return
      if (requestError.status === 401 || requestError.status === 403) { onLogout("انتهت الجلسة. سجلي الدخول مرة أخرى"); return }
      setError(requestError.status === 423 ? "أوقف المنظم الوصول مؤقتاً. أعيدي المحاولة بعد فتح اللوحة" : "تعذر تحميل التعهد. تحققي من الاتصال ثم أعيدي المحاولة")
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, retry, onAccepted, onLogout])

  const accept = async (event: FormEvent) => {
    event.preventDefault()
    const controller = controllerRef.current
    if (!data || !consent || savingRef.current || !controller || controller.signal.aborted) return
    savingRef.current = true
    setSaving(true)
    setError("")
    try {
      const result = await agreementRequest<{ token: string }>(token, "e3-cohost-accept-agreement", controller.signal, {
        accepted: true,
        full_name: fullName,
        version: data.agreement.version,
        agreement_hash: data.agreement_hash,
      })
      if (controller.signal.aborted) return
      if (!result.token) throw new Error("لم يكتمل حفظ الموافقة. حاولي مجدداً")
      onAccepted(result.token)
    } catch (requestError) {
      if (controller.signal.aborted) return
      const failure = requestError as AgreementError
      if (failure.status === 401 || failure.status === 403) { onLogout("انتهت الجلسة. سجلي الدخول مرة أخرى"); return }
      if (failure.code === "AGREEMENT_CHANGED") { setRetry(value => value + 1); return }
      setError(failure.status === 423 ? "أوقف المنظم الوصول مؤقتاً. لا يمكن إكمال الدخول الآن" : failure.name === "TimeoutError" || failure.name === "AbortError" ? "انتهت مهلة الاتصال. أعيدي المحاولة؛ لن تتكرر الموافقة المسجلة" : failure.message || "تعذر حفظ الموافقة. حاولي مجدداً")
    } finally {
      savingRef.current = false
      if (!controller.signal.aborted) setSaving(false)
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#06090f] px-4 py-6 text-white sm:py-10" dir="rtl">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6 flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-teal-300/20 bg-teal-300/10 text-teal-200"><ShieldCheck size={24} /></span>
          <div><p className="text-xs font-bold text-teal-300">التوافق الأعمى · لوحة المضيفة</p><h1 className="mt-1 text-xl font-black sm:text-2xl">تعهد السرية وحماية البيانات</h1><p className="mt-2 text-sm leading-6 text-slate-400">قبل الاطلاع على بيانات المشاركين، اقرئي التعهد وأكدي موافقتك.</p></div>
        </header>
        {loading ? <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-slate-300"><Loader2 className="animate-spin" size={20} /> جارٍ التحقق من التعهد…</div> : null}
        {data ? <>
          <article aria-label={data.agreement.title} className="rounded-3xl border border-white/10 bg-[#0b1019] p-5 sm:p-7">
            <p className="text-xs text-slate-500">النسخة {data.agreement.version}</p>
            <p className="mt-3 text-sm leading-7 text-slate-200">{data.agreement.introduction}</p>
            <ol className="mt-6 space-y-5">{data.agreement.sections.map((section, index) => <li key={section.title}><h2 className="text-sm font-bold text-teal-100">{index + 1}. {section.title}</h2><p className="mt-1 text-sm leading-7 text-slate-300">{section.text}</p></li>)}</ol>
            <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(cohostAgreementText(data.agreement))}`} download={`blindmatch-confidentiality-${data.agreement.version}.txt`} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-teal-200 underline underline-offset-4"><Download size={16} /> تنزيل نسخة التعهد</a>
          </article>
          <form onSubmit={accept} className="mt-4 rounded-3xl border border-teal-300/15 bg-teal-950/15 p-5 sm:p-6">
            <label htmlFor="cohost-agreement-name" className="block text-sm font-bold text-slate-200">الاسم الكامل</label>
            <input id="cohost-agreement-name" name="name" autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} required minLength={3} maxLength={120} disabled={saving} placeholder="الاسم واسم العائلة" className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-base outline-none focus:border-teal-300/60 disabled:opacity-60" />
            <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-7 text-slate-200"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required disabled={saving} className="mt-1.5 h-5 w-5 shrink-0 accent-teal-300" /><span>{data.agreement.confirmation}</span></label>
            <p className="mt-4 text-xs leading-6 text-slate-400">{data.agreement.recordNotice}</p>
            {error ? <p role="alert" className="mt-4 rounded-xl border border-red-400/25 bg-red-950/30 p-3 text-sm leading-6 text-red-200">{error}</p> : null}
            <button type="submit" disabled={saving || !consent || fullName.trim().length < 3} aria-busy={saving} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-300 px-3 font-black text-slate-950 disabled:opacity-40">{saving ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}{saving ? "جارٍ حفظ الموافقة…" : "أوافق وأدخل اللوحة"}</button>
          </form>
        </> : !loading ? <div className="rounded-3xl border border-amber-300/20 bg-amber-950/15 p-5"><p role="alert" className="text-sm leading-7 text-amber-100">{error || "تعذر تحميل التعهد"}</p><button onClick={() => setRetry(value => value + 1)} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-200 font-bold text-slate-950"><RefreshCw size={17} /> إعادة المحاولة</button></div> : null}
        <button type="button" onClick={() => onLogout()} disabled={saving} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm text-slate-400 disabled:opacity-40"><LogOut size={16} /> تسجيل الخروج دون الدخول</button>
      </div>
    </main>
  )
}
