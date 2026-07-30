import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import {
  Activity, Check, CheckCircle2, ChevronDown, CircleDot, Clock3,
  CreditCard, FileCheck2, Inbox, Loader2, MessageCircle, RefreshCw,
  Save, Search, Send, ShieldCheck, Smartphone, UserCheck, Users,
  XCircle,
} from "lucide-react"

type ConsoleTab = "overview" | "templates" | "responses" | "participants" | "messages" | "approvals"

const STATUS_STYLE: Record<string, string> = {
  queued: "border-slate-500/40 bg-slate-500/15 text-slate-200",
  sent: "border-blue-500/40 bg-blue-500/15 text-blue-200",
  delivered: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200",
  read: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  failed: "border-red-500/40 bg-red-500/15 text-red-200",
  undelivered: "border-orange-500/40 bg-orange-500/15 text-orange-200",
  received: "border-violet-500/40 bg-violet-500/15 text-violet-200",
  approved: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  pending: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  received_approval: "border-blue-500/40 bg-blue-500/15 text-blue-200",
  rejected: "border-red-500/40 bg-red-500/15 text-red-200",
  paused: "border-orange-500/40 bg-orange-500/15 text-orange-200",
  disabled: "border-slate-600/40 bg-slate-600/15 text-slate-300",
  unsubmitted: "border-slate-600/40 bg-slate-600/15 text-slate-300",
}

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued", sent: "Sent", delivered: "Delivered", read: "Read",
  failed: "Failed", undelivered: "Undelivered", received: "Inbound",
  approved: "Approved", pending: "Pending", rejected: "Rejected", paused: "Paused",
  disabled: "Disabled", unsubmitted: "Unsubmitted", received_approval: "Received",
}

function StatusBadge({ status }: { status?: string | null }) {
  const key = String(status || "unsubmitted").toLowerCase()
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[key] || STATUS_STYLE.queued}`}>
    <CircleDot className="h-2.5 w-2.5" />{STATUS_LABEL[key] || key}
  </span>
}

function fmtDate(value?: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })
}

function participantName(p: any) {
  return p?.name || p?.survey_data?.answers?.name || p?.survey_data?.name || `المشارك #${p?.assigned_number}`
}

const fieldClass = "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10"
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"

export default function TwilioAdminPanel({ adminPassword, onParticipantChanged, onUnauthorized }: { adminPassword: string; onParticipantChanged?: () => void; onUnauthorized?: () => void }) {
  const [tab, setTab] = useState<ConsoleTab>("overview")
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [messageStatus, setMessageStatus] = useState("all")
  const [participantFilter, setParticipantFilter] = useState("all")
  const [selectedTemplate, setSelectedTemplate] = useState<Record<number, string>>({})
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(new Set())
  const [bulkTemplate, setBulkTemplate] = useState("")
  const [participantLoading, setParticipantLoading] = useState(false)

  const call = useCallback(async (action: string, body: Record<string, any> = {}) => {
    if (!adminPassword) {
      onUnauthorized?.()
      throw new Error("انتهت جلسة الإدارة. سجّل الدخول مجدداً.")
    }
    const response = await fetch("/api/twilio-console", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Password": adminPassword },
      body: JSON.stringify({ action, password: adminPassword, ...body }),
    })
    const result = await response.json()
    if (response.status === 401 || response.status === 403) {
      onUnauthorized?.()
      throw new Error("انتهت جلسة الإدارة. سجّل الدخول مجدداً.")
    }
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`)
    return result
  }, [adminPassword, onUnauthorized])

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true)
    try {
      setData(await call("dashboard"))
    } catch (error: any) {
      toast.error(error.message || "تعذر تحميل لوحة Twilio")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [call])

  const loadParticipantPage = useCallback(async (append = false, cursor: number | null = null) => {
    if (!data?.eventId) return
    setParticipantLoading(true)
    try {
      const result = await call("participant-page", {
        event_id: data.eventId,
        cursor: append ? cursor : 0,
        search: search.trim(),
        filter: participantFilter,
        limit: 40,
      })
      setData((current: any) => ({
        ...current,
        participants: append ? [...(current.participants || []), ...(result.participants || [])] : (result.participants || []),
        participantPage: { hasMore: result.hasMore, nextCursor: result.nextCursor, pageSize: result.pageSize },
      }))
    } catch (error: any) {
      toast.error(error.message || "تعذر تحميل المشاركين")
    } finally {
      setParticipantLoading(false)
    }
  }, [call, data?.eventId, participantFilter, search])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (tab !== "participants" || !data?.eventId) return
    const timer = window.setTimeout(() => {
      setSelectedNumbers(new Set())
      loadParticipantPage(false)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [tab, search, participantFilter, data?.eventId, loadParticipantPage])
  useEffect(() => {
    if (tab !== "overview" && tab !== "messages" && tab !== "approvals") return
    const timer = window.setInterval(() => load(true), 15000)
    return () => window.clearInterval(timer)
  }, [tab, load])

  const updateTemplateLocal = (id: string, patch: any) => setData((current: any) => ({
    ...current,
    templates: current.templates.map((item: any) => item.id === id ? { ...item, ...patch } : item),
  }))
  const updateResponseLocal = (id: string, patch: any) => setData((current: any) => ({
    ...current,
    responses: current.responses.map((item: any) => item.id === id ? { ...item, ...patch } : item),
  }))

  const saveTemplate = async (template: any) => {
    setSaving(`template-${template.id}`)
    try {
      await call("update-template", { id: template.id, patch: template })
      toast.success("تم حفظ القالب")
      await load(true)
    } catch (error: any) { toast.error(error.message) }
    finally { setSaving(null) }
  }

  const saveResponse = async (rule: any) => {
    setSaving(`response-${rule.id}`)
    try {
      await call("update-response", { id: rule.id, response_text: rule.response_text, enabled: rule.enabled })
      toast.success("تم حفظ الرد")
    } catch (error: any) { toast.error(error.message) }
    finally { setSaving(null) }
  }

  const syncApprovals = async () => {
    setSaving("sync")
    try {
      const result = await call("sync-approvals")
      const failures = result.results?.filter((r: any) => !r.success) || []
      failures.length ? toast.error(`تم التحديث مع ${failures.length} أخطاء`) : toast.success("تم تحديث حالات الاعتماد من Twilio")
      await load(true)
    } catch (error: any) { toast.error(error.message) }
    finally { setSaving(null) }
  }

  const setParticipantAction = async (participant: any, actionKey: string, value: string | number) => {
    setSaving(`participant-${participant.assigned_number}-${actionKey}`)
    try {
      await call("set-participant-action", { assigned_number: participant.assigned_number, action_key: actionKey, value, event_id: data.eventId })
      toast.success(`تم تحديث ${participantName(participant)}`)
      await loadParticipantPage(false)
      onParticipantChanged?.()
    } catch (error: any) { toast.error(error.message) }
    finally { setSaving(null) }
  }

  const sendTemplate = async (participant: any) => {
    const key = selectedTemplate[participant.assigned_number]
    if (!key) return toast.error("اختر قالباً أولاً")
    setSaving(`send-${participant.assigned_number}`)
    try {
      const result = await call("send-template", { assigned_number: participant.assigned_number, template_key: key })
      result.skipped ? toast(`تم التخطي: ${result.reason}`) : toast.success(`تم الإرسال: ${result.status}`)
      await load(true)
    } catch (error: any) { toast.error(error.message) }
    finally { setSaving(null) }
  }

  const bulkSend = async () => {
    if (!bulkTemplate || selectedNumbers.size === 0) return toast.error("اختر قالباً ومشاركين")
    const template = approvedTemplates.find((item: any) => item.template_key === bulkTemplate)
    if (!window.confirm(`إرسال قالب ${template?.friendly_name || bulkTemplate} إلى ${selectedNumbers.size} مشارك؟`)) return
    setSaving("bulk-send")
    try {
      const result = await call("bulk-send-template", { template_key: bulkTemplate, participant_numbers: Array.from(selectedNumbers) })
      result.failed ? toast.error(`تم إرسال ${result.sent}، فشل ${result.failed}، تخطي ${result.skipped}`) : toast.success(`تم إرسال ${result.sent} رسالة${result.skipped ? ` وتخطي ${result.skipped}` : ""}`)
      setSelectedNumbers(new Set())
      await load(true)
    } catch (error: any) { toast.error(error.message) }
    finally { setSaving(null) }
  }

  const approvedTemplates = useMemo(() => (data?.templates || []).filter((t: any) => t.enabled && t.approval_status === "approved" && t.content_sid), [data])
  const participants = useMemo(() => data?.participants || [], [data?.participants])
  const messages = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.messages || []).filter((m: any) => {
      const statusMatch = messageStatus === "all" || m.status === messageStatus
      const searchMatch = !q || `${m.assigned_number || ""} ${m.phone_number || ""} ${m.message_body || ""} ${m.template_sid || ""}`.toLowerCase().includes(q)
      return statusMatch && searchMatch
    })
  }, [data, messageStatus, search])

  if (loading) return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-cyan-300" /></div>
  if (!data) return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-200">تعذر تحميل لوحة Twilio.</div>

  const nav: { id: ConsoleTab; label: string; icon: any; count?: number }[] = [
    { id: "overview", label: "العمليات", icon: Activity },
    { id: "templates", label: "القوالب", icon: Smartphone, count: data.templates?.filter((t: any) => t.approval_status !== "approved").length },
    { id: "responses", label: "الردود", icon: MessageCircle },
    { id: "participants", label: "المشاركون", icon: Users },
    { id: "messages", label: "التسليم", icon: Inbox, count: (data.delivery.failed || 0) + (data.delivery.undelivered || 0) },
    { id: "approvals", label: "الموافقات", icon: ShieldCheck, count: (data.attendanceRequests?.length || 0) + (data.stats.receiptsPending || 0) },
  ]

  return <section dir="rtl" className="space-y-4">
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/55 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
      <div className="border-b border-white/10 bg-gradient-to-l from-cyan-500/10 via-slate-900/30 to-violet-500/10 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-cyan-300" /><h2 className="text-lg font-black">مركز عمليات Twilio</h2><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">LIVE</span></div>
            <p className="mt-1 text-xs text-slate-400">القوالب والردود والتسليم وحالة كل مشارك في مكان واحد</p>
          </div>
          <button onClick={() => load(true)} disabled={refreshing} className={`${buttonClass} border-white/10 bg-white/5 text-slate-200 hover:bg-white/10`}><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />تحديث</button>
        </div>
      </div>
      <div className="overflow-x-auto border-b border-white/10 p-2 scrollbar-hide">
        <div className="flex min-w-max gap-1">
          {nav.map(item => <button key={item.id} onClick={() => { setTab(item.id); setSearch("") }} className={`relative flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition sm:px-4 sm:text-sm ${tab === item.id ? "bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
            <item.icon className="h-4 w-4" />{item.label}{Boolean(item.count) && <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-[10px] ${tab === item.id ? "bg-slate-950 text-white" : "bg-red-500 text-white"}`}>{item.count}</span>}
          </button>)}
        </div>
      </div>
    </div>

    {tab === "overview" && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["مؤكد", data.stats.confirmed, "confirmed", "text-emerald-300", UserCheck],
          ["بانتظار الدفع", data.stats.awaitingReceipt, "awaiting_payment", "text-amber-300", CreditCard],
          ["إيصالات معلقة", data.stats.receiptsPending, "approvals", "text-cyan-300", FileCheck2],
          ["متأخر/بالطريق", data.stats.late + data.stats.onWay, "late", "text-orange-300", Clock3],
        ].map(([label, value, target, color, Icon]: any) => <button key={label} onClick={() => target === "approvals" ? setTab("approvals") : (setParticipantFilter(target), setTab("participants"))} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-right transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.07]">
          <div className="flex items-start justify-between"><Icon className={`h-5 w-5 ${color}`} /><span className={`text-2xl font-black ${color}`}>{value}</span></div><p className="mt-3 text-xs font-bold text-slate-300">{label}</p>
        </button>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="font-black">حالة التسليم</h3><p className="text-xs text-slate-500">آخر 100 رسالة مسجلة</p></div><button onClick={() => setTab("messages")} className="text-xs font-bold text-cyan-300">عرض الكل</button></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {["queued", "sent", "delivered", "read", "failed", "undelivered"].map(status => <button key={status} onClick={() => { setMessageStatus(status); setTab("messages") }} className={`rounded-xl border p-3 text-right ${STATUS_STYLE[status]}`}><p className="text-xl font-black">{data.delivery[status] || 0}</p><p className="mt-1 text-[10px] font-bold uppercase">{STATUS_LABEL[status]}</p></button>)}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-black">جاهزية القوالب</h3><button onClick={syncApprovals} disabled={saving === "sync"} className={`${buttonClass} border-violet-400/20 bg-violet-400/10 text-violet-200`}><RefreshCw className={`h-3.5 w-3.5 ${saving === "sync" ? "animate-spin" : ""}`} />مزامنة</button></div>
          <div className="space-y-2">{data.templates.map((t: any) => <button key={t.id} onClick={() => setTab("templates")} className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-right"><div><p className="text-xs font-bold text-white">{t.friendly_name}</p><p className="mt-0.5 text-[10px] text-slate-500">{t.content_sid || "SID غير مضاف"}</p></div><StatusBadge status={t.approval_status} /></button>)}</div>
        </div>
      </div>
    </>}

    {tab === "templates" && <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black">قوالب WhatsApp</h3><p className="text-xs text-slate-400">أضف SID بعد إنشاء القالب، ثم زامن حالة اعتماد WhatsApp.</p></div><button onClick={syncApprovals} disabled={saving === "sync"} className={`${buttonClass} border-violet-400/30 bg-violet-400/10 text-violet-200 hover:bg-violet-400/20`}><RefreshCw className={`h-4 w-4 ${saving === "sync" ? "animate-spin" : ""}`} />مزامنة الاعتمادات</button></div>
      <div className="grid gap-4 xl:grid-cols-2">{data.templates.map((template: any) => <article key={template.id} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-white/[0.035] p-4"><div><div className="flex flex-wrap items-center gap-2"><h4 className="font-black">{template.friendly_name}</h4><StatusBadge status={template.approval_status} /></div><p className="mt-1 text-xs text-slate-500">{template.description}</p></div><label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={template.enabled} onChange={e => updateTemplateLocal(template.id, { enabled: e.target.checked })} className="accent-cyan-400" />مفعّل</label></div>
        <div className="space-y-3 p-4">
          <label className="block text-xs text-slate-400">Content SID<input value={template.content_sid || ""} onChange={e => updateTemplateLocal(template.id, { content_sid: e.target.value.trim() || null })} placeholder="HX…" className={`${fieldClass} mt-1 font-mono ltr:text-left`} dir="ltr" /></label>
          <div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-400">Category<select value={template.category} onChange={e => updateTemplateLocal(template.id, { category: e.target.value })} className={`${fieldClass} mt-1`}><option>UTILITY</option><option>MARKETING</option><option>AUTHENTICATION</option></select></label><label className="text-xs text-slate-400">Approval<select value={template.approval_status} onChange={e => updateTemplateLocal(template.id, { approval_status: e.target.value })} className={`${fieldClass} mt-1`}><option value="unsubmitted">Unsubmitted</option><option value="received">Received</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="paused">Paused</option><option value="disabled">Disabled</option></select></label></div>
          {template.body_text && <label className="block text-xs text-slate-400">نص مرجعي للمعاينة <span className="text-slate-600">(لا يغيّر نسخة Twilio المعتمدة)</span><textarea value={template.body_text} onChange={e => updateTemplateLocal(template.id, { body_text: e.target.value })} rows={7} className={`${fieldClass} mt-1 resize-y leading-6`} /></label>}
          <div className="flex flex-wrap gap-1.5">{(template.buttons || []).map((button: any, i: number) => <span key={i} className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-200">{button.title} <span className="opacity-50">{button.id || "URL"}</span></span>)}</div>
          {template.rejection_reason && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">{template.rejection_reason}</div>}
          <button onClick={() => saveTemplate(template)} disabled={saving === `template-${template.id}`} className={`${buttonClass} w-full border-cyan-400/30 bg-cyan-400 text-slate-950 hover:bg-cyan-300`}><Save className="h-4 w-4" />حفظ القالب</button>
        </div>
      </article>)}</div>
    </div>}

    {tab === "responses" && <div className="space-y-4">
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-xs leading-6 text-amber-100"><strong>الردود فورية.</strong> التعديل هنا يغيّر رسالة الرد التالية دون نشر جديد. أبقِ المتغيرات بين أقواس مثل <code>{"{price}"}</code> و<code>{"{participant_number}"}</code>.</div>
      <div className="grid gap-3 xl:grid-cols-2">{data.responses.map((rule: any) => <article key={rule.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-3 flex items-start justify-between gap-3"><div><h4 className="text-sm font-black">{rule.label}</h4><p className="mt-1 font-mono text-[10px] text-cyan-300">{rule.action_key}</p></div><label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={rule.enabled} onChange={e => updateResponseLocal(rule.id, { enabled: e.target.checked })} className="accent-cyan-400" />مفعّل</label></div>
        <textarea value={rule.response_text} onChange={e => updateResponseLocal(rule.id, { response_text: e.target.value })} rows={6} className={`${fieldClass} resize-y leading-6`} />
        <button onClick={() => saveResponse(rule)} disabled={saving === `response-${rule.id}`} className={`${buttonClass} mt-3 w-full border-white/10 bg-white/5 text-white hover:bg-white/10`}><Save className="h-4 w-4" />حفظ الرد</button>
      </article>)}</div>
    </div>}

    {tab === "participants" && <div className="space-y-3">
      <div className="sticky top-2 z-20 grid gap-2 rounded-2xl border border-white/10 bg-slate-950/90 p-3 shadow-xl backdrop-blur-xl sm:grid-cols-[1fr_220px]">
        <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="الاسم، الرقم أو الهاتف" className={`${fieldClass} pr-9`} /></div>
        <select value={participantFilter} onChange={e => setParticipantFilter(e.target.value)} className={fieldClass}><option value="all">كل المشاركين</option><option value="confirmed">مؤكد</option><option value="awaiting_payment">بانتظار الدفع</option><option value="declined">معتذر</option><option value="on_way">في الطريق</option><option value="late">متأخر</option><option value="arrived">وصل</option></select>
      </div>
      <div className="flex flex-col gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-950/70 p-3 shadow-xl sm:flex-row sm:items-center">
        <button onClick={() => setSelectedNumbers(current => current.size === participants.length ? new Set() : new Set(participants.map((p: any) => p.assigned_number)))} className={`${buttonClass} border-white/10 bg-white/5 text-white`}>
          {selectedNumbers.size === participants.length && participants.length > 0 ? "إلغاء تحديد الكل" : `تحديد الظاهر (${participants.length})`}
        </button>
        <select value={bulkTemplate} onChange={e => setBulkTemplate(e.target.value)} className={`${fieldClass} sm:flex-1`}><option value="">قالب الإرسال الجماعي</option>{approvedTemplates.map((t: any) => <option key={t.template_key} value={t.template_key}>{t.friendly_name}</option>)}</select>
        <button onClick={bulkSend} disabled={!bulkTemplate || selectedNumbers.size === 0 || saving === "bulk-send"} className={`${buttonClass} border-cyan-300/30 bg-cyan-400 text-slate-950 hover:bg-cyan-300`}><Send className="h-4 w-4" />إرسال إلى {selectedNumbers.size}</button>
      </div>
      <p className="px-1 text-xs text-slate-500">يعرض {participants.length} من أصل {data.stats.participants} مشارك — البحث والتصفية يعملان من الخادم.</p>
      <div className="grid gap-3 xl:grid-cols-2">{participants.map((p: any) => <details key={p.id} className="group rounded-2xl border border-white/10 bg-white/[0.04] open:border-cyan-400/20 open:bg-cyan-400/[0.035]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4"><div className="flex min-w-0 items-start gap-3"><input type="checkbox" checked={selectedNumbers.has(p.assigned_number)} onClick={e => e.stopPropagation()} onChange={e => setSelectedNumbers(current => { const next = new Set(current); e.target.checked ? next.add(p.assigned_number) : next.delete(p.assigned_number); return next })} className="mt-1 h-4 w-4 shrink-0 accent-cyan-400" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-black">#{p.assigned_number}</span><h4 className="truncate font-black">{participantName(p)}</h4>{p.attendance_confirmed ? <span className="text-[10px] font-bold text-emerald-300">مؤكد</span> : p.attendance_denied_at ? <span className="text-[10px] font-bold text-red-300">معتذر</span> : <span className="text-[10px] font-bold text-slate-500">لم يرد</span>}</div><div className="mt-2 flex flex-wrap gap-1.5"><span className={`rounded-full px-2 py-0.5 text-[10px] ${p.PAID_DONE || p.payment_waived ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{p.payment_waived ? "معفى" : p.PAID_DONE ? "مدفوع" : "غير مدفوع"}</span>{p.arrival_status && <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] text-orange-300">{p.arrival_status}</span>}{p.age_flex_years > 0 && <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">مرونة عمر ±{p.age_flex_years}</span>}</div></div></div><ChevronDown className="h-5 w-5 shrink-0 text-slate-500 transition group-open:rotate-180" /></summary>
        <div className="space-y-4 border-t border-white/10 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <ActionSelect label="الحضور" value={p.attendance_confirmed ? "confirmed" : p.attendance_denied_at ? "declined" : "pending"} options={[["pending","لم يرد"],["confirmed","مؤكد"],["declined","معتذر"]]} onChange={v => setParticipantAction(p, "attendance", v)} disabled={saving?.includes(`${p.assigned_number}-attendance`)} />
            <ActionSelect label="الدفع" value={p.payment_waived ? "waived" : p.PAID_DONE ? "paid" : "unpaid"} options={[["unpaid","غير مدفوع"],["paid","مدفوع"],["waived","معفى"]]} onChange={v => setParticipantAction(p, "payment", v)} disabled={saving?.includes(`${p.assigned_number}-payment`)} />
            <ActionSelect label="الوصول" value={p.arrival_status || "none"} options={[["none","غير محدد"],["on_way","في الطريق"],["late","متأخر"],["arrived","وصل"],["cancelled","لن يحضر"]]} onChange={v => setParticipantAction(p, "arrival", v)} disabled={saving?.includes(`${p.assigned_number}-arrival`)} />
            <ActionSelect label="تفضيل الجنس" value={p.any_gender_preference ? "any" : p.same_gender_preference ? "same" : "different"} options={[["different","جنس مختلف"],["same","نفس الجنس"],["any","أي جنس"]]} onChange={v => setParticipantAction(p, "gender_preference", v)} disabled={saving?.includes(`${p.assigned_number}-gender_preference`)} />
            <ActionSelect label="مرونة العمر" value={String(p.age_flex_years || 0)} options={[["0","بدون مرونة"],["2","± سنتين"],["5","± 5 سنوات"]]} onChange={v => setParticipantAction(p, "age_flexibility", Number(v))} disabled={saving?.includes(`${p.assigned_number}-age_flexibility`)} />
            <ActionSelect label="العرض" value={p.discount_interest || "none"} options={[["none","لم يرد"],["interested","مهتم"],["declined","غير مهتم"]]} onChange={v => setParticipantAction(p, "discount", v)} disabled={saving?.includes(`${p.assigned_number}-discount`)} />
            <ActionSelect label="التسجيل التلقائي" value={p.auto_signup_next_event ? "enabled" : "disabled"} options={[["disabled","متوقف"],["enabled","مفعّل"]]} onChange={v => setParticipantAction(p, "auto_signup", v)} disabled={saving?.includes(`${p.assigned_number}-auto_signup`)} />
          </div>
          <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3"><p className="mb-2 text-[10px] font-bold text-cyan-300">إرسال قالب معتمد</p><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><select value={selectedTemplate[p.assigned_number] || ""} onChange={e => setSelectedTemplate(current => ({ ...current, [p.assigned_number]: e.target.value }))} className={fieldClass}><option value="">اختر القالب</option>{approvedTemplates.map((t: any) => <option key={t.template_key} value={t.template_key}>{t.friendly_name}</option>)}</select><button onClick={() => sendTemplate(p)} disabled={!p.phone_number || !selectedTemplate[p.assigned_number] || saving === `send-${p.assigned_number}`} className={`${buttonClass} border-cyan-300/30 bg-cyan-400 text-slate-950 hover:bg-cyan-300`}><Send className="h-4 w-4" />إرسال</button></div>{!p.phone_number && <p className="mt-2 text-[10px] text-red-300">لا يوجد رقم هاتف</p>}</div>
          <div className="flex flex-wrap justify-between gap-2 text-[10px] text-slate-500"><span>{p.phone_number || "بدون هاتف"}</span><span>آخر إجراء: {p.last_twilio_action || "—"} · {fmtDate(p.last_twilio_action_at)}</span></div>
        </div>
      </details>)}</div>
      {participantLoading && <div className="flex justify-center py-5"><Loader2 className="h-6 w-6 animate-spin text-cyan-300" /></div>}
      {!participantLoading && data.participantPage?.hasMore && <button onClick={() => loadParticipantPage(true, data.participantPage.nextCursor)} className={`${buttonClass} w-full border-cyan-400/20 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20`}>تحميل 40 مشاركاً إضافياً</button>}
    </div>}

    {tab === "messages" && <div className="space-y-3">
      <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:grid-cols-[1fr_200px]"><div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في الرسائل" className={`${fieldClass} pr-9`} /></div><select value={messageStatus} onChange={e => setMessageStatus(e.target.value)} className={fieldClass}><option value="all">كل الحالات</option>{["queued","sent","delivered","read","failed","undelivered","received"].map(s => <option key={s}>{s}</option>)}</select></div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]"><div className="hidden grid-cols-[110px_130px_1fr_140px] gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3 text-[10px] font-bold uppercase text-slate-500 md:grid"><span>Participant</span><span>Status</span><span>Message</span><span>Time</span></div>{messages.map((m: any) => <div key={m.id} className="grid gap-2 border-b border-white/5 p-4 last:border-0 md:grid-cols-[110px_130px_1fr_140px] md:items-start md:gap-3"><div><p className="text-xs font-black">{m.assigned_number ? `#${m.assigned_number}` : "Unknown"}</p><p className="mt-1 truncate text-[10px] text-slate-600">{m.direction}</p></div><StatusBadge status={m.status} /><div className="min-w-0"><p className="line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-300">{m.message_body || (m.template_sid ? `Template ${m.template_sid}` : m.button_text || "—")}</p>{(m.error_code || m.error_message) && <p className="mt-2 rounded-lg bg-red-500/10 p-2 text-[10px] text-red-300">{m.error_code ? `${m.error_code}: ` : ""}{m.error_message}</p>}<p className="mt-1 truncate font-mono text-[9px] text-slate-600">{m.twilio_message_sid}</p></div><span className="text-[10px] text-slate-500">{fmtDate(m.status_updated_at || m.created_at)}</span></div>)}{messages.length === 0 && <div className="p-10 text-center text-sm text-slate-500">لا توجد رسائل مطابقة.</div>}</div>
    </div>}

    {tab === "approvals" && <ApprovalsPanel data={data} adminPassword={adminPassword} onRefresh={() => load(true)} />}
  </section>
}

function ActionSelect({ label, value, options, onChange, disabled }: { label: string; value: string; options: string[][]; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="block text-[10px] font-bold text-slate-500">{label}<select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className={`${fieldClass} mt-1 text-xs`}>{options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>
}

function ApprovalsPanel({ data, adminPassword, onRefresh }: { data: any; adminPassword: string; onRefresh: () => void }) {
  const [working, setWorking] = useState<string | null>(null)
  const receipts = data.receiptApprovals || []
  const adminCall = async (action: string, body: any) => {
    setWorking(`${action}-${body.assigned_number || body.id}`)
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Password": adminPassword }, body: JSON.stringify({ action, password: adminPassword, ...body }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Request failed")
      toast.success("تم تنفيذ الإجراء")
      onRefresh()
    } catch (error: any) { toast.error(error.message) }
    finally { setWorking(null) }
  }
  return <div className="grid gap-4 xl:grid-cols-2">
    <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.035] p-4"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-black">مراجعة الإيصالات</h3><p className="text-xs text-slate-500">{receipts.length} بانتظار القرار · فعالية {data.eventId}</p></div><FileCheck2 className="h-5 w-5 text-cyan-300" /></div><div className="space-y-2">{receipts.map((p: any) => <div key={p.receipt_id || p.id} className="rounded-xl border border-white/10 bg-slate-950/50 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-black">#{p.assigned_number} · {participantName(p)}</p><p className="mt-1 text-[10px] text-slate-500">فعالية {p.receipt_event_id || data.eventId} · {fmtDate(p.receipt_received_at)}</p></div><a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-cyan-300">عرض الإيصال</a></div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => adminCall("approve-receipt", { assigned_number: p.assigned_number, receipt_id: p.receipt_id, event_id: p.receipt_event_id || data.eventId })} disabled={Boolean(working)} className={`${buttonClass} border-emerald-400/20 bg-emerald-400/10 text-emerald-200`}><Check className="h-4 w-4" />اعتماد</button><button onClick={() => { const reason = window.prompt("سبب الرفض (اختياري)") ?? ""; adminCall("reject-receipt", { assigned_number: p.assigned_number, receipt_id: p.receipt_id, event_id: p.receipt_event_id || data.eventId, reason }) }} disabled={Boolean(working)} className={`${buttonClass} border-red-400/20 bg-red-400/10 text-red-200`}><XCircle className="h-4 w-4" />رفض</button></div></div>)}{receipts.length === 0 && <EmptyState text="لا توجد إيصالات معلقة لهذه الفعالية" />}</div></section>
    <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.035] p-4"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-black">إشعارات قرارات الحضور</h3><p className="text-xs text-slate-500">{data.attendanceRequests?.length || 0} غير مقروءة · تم تطبيق القرار وإبلاغ المشارك فوراً</p></div><UserCheck className="h-5 w-5 text-amber-300" /></div><div className="space-y-2">{(data.attendanceRequests || []).map((r: any) => <div key={r.id} className="rounded-xl border border-white/10 bg-slate-950/50 p-3"><div className="flex items-center justify-between"><div><p className="text-sm font-black">#{r.assigned_number}</p><p className="mt-1 text-[10px] text-slate-500">{r.request_type === "confirm" ? "أكد حضوره" : "اعتذر عن الحضور"} · {fmtDate(r.created_at)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${r.request_type === "confirm" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>{r.request_type === "confirm" ? "تم تأكيد الحضور" : "تم تسجيل الاعتذار"}</span></div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => adminCall("approve-attendance-request", { request_id: r.id })} disabled={Boolean(working)} className={`${buttonClass} border-emerald-400/20 bg-emerald-400/10 text-emerald-200`}><Check className="h-4 w-4" />تمت المراجعة</button><button onClick={() => adminCall("reject-attendance-request", { request_id: r.id })} disabled={Boolean(working)} className={`${buttonClass} border-slate-400/20 bg-slate-400/10 text-slate-200`}><XCircle className="h-4 w-4" />إخفاء الإشعار</button></div></div>)}{!data.attendanceRequests?.length && <EmptyState text="لا توجد إشعارات حضور جديدة" />}</div></section>
  </div>
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-10 text-slate-600"><CheckCircle2 className="mb-2 h-6 w-6" /><p className="text-xs">{text}</p></div>
}
