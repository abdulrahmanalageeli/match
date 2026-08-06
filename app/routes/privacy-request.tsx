import { useState } from "react"

export default function PrivacyRequest() {
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [token, setToken] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/participant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تنفيذ الطلب")
      return data
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تنفيذ الطلب"); return null }
    finally { setBusy(false) }
  }

  const requestOtp = async () => { const data = await call("request-otp", { phone_number: phone }); if (data) setMessage("تم إرسال رمز التحقق عبر واتساب") }
  const verifyOtp = async () => { const data = await call("verify-otp", { phone_number: phone, otp }); if (data?.secure_token) { setToken(data.secure_token); setMessage("تم التحقق من هويتك") } }
  const exportData = async () => {
    const data = await call("export-my-data", { secure_token: token }); if (!data) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    const link = document.createElement("a"); link.href = url; link.download = `blindmatch-data-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url)
    setMessage("تم تنزيل نسخة بياناتك")
  }
  const submitRequest = async (action: string) => { const data = await call(action, { secure_token: token }); if (data) setMessage("تم تسجيل طلبك بعد التحقق من الهوية، وسنؤكد اكتماله عبر قناة التواصل المسجلة") }

  return <main dir="rtl" className="min-h-screen bg-slate-950 px-4 py-12 text-white"><section className="mx-auto max-w-lg space-y-5 rounded-3xl border border-white/10 bg-white/5 p-7">
    <div><h1 className="text-2xl font-black">بوابة حقوق البيانات</h1><p className="mt-2 text-sm leading-7 text-slate-300">الوصول إلى نسخة بياناتك أو سحب الموافقة أو طلب الإتلاف. نتحقق من الهوية عبر الرقم المسجل.</p></div>
    {!token ? <>
      <label className="block text-sm">رقم الجوال<input value={phone} onChange={e => setPhone(e.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 p-3" inputMode="tel" /></label>
      <button disabled={busy || !phone} onClick={requestOtp} className="w-full rounded-xl bg-cyan-400 p-3 font-black text-slate-950 disabled:opacity-40">إرسال رمز التحقق</button>
      <label className="block text-sm">رمز التحقق<input value={otp} onChange={e => setOtp(e.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 p-3" inputMode="numeric" /></label>
      <button disabled={busy || !otp} onClick={verifyOtp} className="w-full rounded-xl bg-white p-3 font-black text-slate-950 disabled:opacity-40">تحقق</button>
    </> : <div className="grid gap-3">
      <button disabled={busy} onClick={exportData} className="rounded-xl bg-cyan-400 p-3 font-black text-slate-950">تنزيل نسخة من بياناتي</button>
      <button disabled={busy} onClick={() => submitRequest("withdraw-consent")} className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 font-bold text-amber-200">سحب الموافقة وطلب الإتلاف</button>
      <button disabled={busy} onClick={() => confirm("هل تريد تسجيل طلب إتلاف بياناتك؟") && submitRequest("request-data-deletion")} className="rounded-xl border border-red-400/40 bg-red-400/10 p-3 font-bold text-red-200">طلب إتلاف بياناتي</button>
    </div>}
    {message && <p className="rounded-xl bg-white/10 p-3 text-sm">{message}</p>}
    <p className="text-xs text-slate-400"><a href="/privacy" className="underline">إشعار الخصوصية</a> · <a href="/" className="underline">الرئيسية</a></p>
  </section></main>
}
