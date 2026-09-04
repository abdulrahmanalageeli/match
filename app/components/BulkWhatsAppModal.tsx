import { useState, useEffect, useCallback } from "react"
import { X, Send, Loader2, Users, AlertCircle, CheckCircle2, XCircle, Zap, RefreshCw } from "lucide-react"
import { buildMatchTemplateVariables, resolveParticipantName } from "~/utils/twilioTemplateVariables"
import { getParticipantMatchInsightsCompletion } from "~/lib/matchControl"

interface BulkWhatsAppModalProps {
  isOpen: boolean
  onClose: () => void
  selectedParticipants: Set<number>
  participants: any[]
}

type TemplateSendHistory = Record<string, {
  count: number
  lastSentAt: string | null
  lastStatus: string | null
}>

type DeliveryStatus = {
  status: string
  updatedAt: string | null
  errorCode: string | null
  errorMessage: string | null
}

type DeliveryStatuses = Record<string, DeliveryStatus>

type TemplateType = 'match' | 'reminder' | 'payment' | 'seat_payment_deadline' | 'survey_update'

type TemplateSids = Record<TemplateType, string | null>

export default function BulkWhatsAppModal({ isOpen, onClose, selectedParticipants, participants }: BulkWhatsAppModalProps) {
  const [templateType, setTemplateType] = useState<TemplateType>('match')
  const [envSids, setEnvSids] = useState<TemplateSids>({ match: null, reminder: null, payment: null, seat_payment_deadline: null, survey_update: null })
  const [config, setConfig] = useState<any>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ successCount: number; failCount: number; skippedCount: number; results: any[] } | null>(null)
  const [error, setError] = useState("")
  const [reviewing, setReviewing] = useState(false)
  const [sendHistory, setSendHistory] = useState<TemplateSendHistory>({})
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyAvailable, setHistoryAvailable] = useState(false)
  const [deliveryStatuses, setDeliveryStatuses] = useState<DeliveryStatuses>({})
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [deliveryError, setDeliveryError] = useState("")

  const currentSid = envSids[templateType]
  const selectedList = participants.filter(p => selectedParticipants.has(p.assigned_number))
  const surveyComplete = templateType === 'survey_update'
    ? selectedList.filter(p => getParticipantMatchInsightsCompletion(p).complete)
    : []
  // Survey completion is informational only. Admins can intentionally resend
  // the update template to any selected participant.
  const targetList = selectedList
  const eligibleList = targetList.filter(p => p.phone_number)
  const withoutPhone = targetList.filter(p => !p.phone_number)
  const sentBefore = eligibleList.filter(p => sendHistory[String(p.assigned_number)])
  const notSentBefore = historyAvailable
    ? eligibleList.filter(p => !sendHistory[String(p.assigned_number)])
    : []

  const submittedResults = (result?.results || []).filter((item: any) => item.success && !item.skipped && item.sid)
  const submittedSids = submittedResults.map((item: any) => String(item.sid))
  const deliveryStatusFor = (item: any) => deliveryStatuses[String(item.sid)]?.status || item.status || "queued"
  const deliveredCount = submittedResults.filter((item: any) => ["delivered", "read"].includes(deliveryStatusFor(item))).length
  const deliveryFailedCount = submittedResults.filter((item: any) => ["failed", "undelivered"].includes(deliveryStatusFor(item))).length
  const deliveryPendingCount = Math.max(0, submittedResults.length - deliveredCount - deliveryFailedCount)

  const refreshDeliveryStatuses = useCallback(async (messageSids: string[]) => {
    if (messageSids.length === 0) return null
    setDeliveryLoading(true)
    setDeliveryError("")
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get-twilio-delivery-statuses",
          messageSids,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) throw new Error(data?.error || "Delivery status request failed")
      setDeliveryStatuses(data.statuses || {})
      return data.statuses || {}
    } catch (statusError: any) {
      console.error("Failed to load Twilio delivery statuses", statusError)
      setDeliveryError(statusError?.message || "Delivery status unavailable")
      return null
    } finally {
      setDeliveryLoading(false)
    }
  }, [])

  const loadSendHistory = useCallback(async (templateSid: string | null) => {
    if (!isOpen || !templateSid || selectedParticipants.size === 0) {
      setSendHistory({})
      setHistoryAvailable(false)
      return
    }
    setHistoryLoading(true)
    setHistoryAvailable(false)
    setSendHistory({})
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get-twilio-template-send-history",
          templateSid,
          participantNumbers: Array.from(selectedParticipants),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) throw new Error(data?.error || "Send history request failed")
      setSendHistory(data.history || {})
      setHistoryAvailable(true)
    } catch (historyError) {
      console.error("Failed to load template send history", historyError)
      setSendHistory({})
      setHistoryAvailable(false)
    } finally {
      setHistoryLoading(false)
    }
  }, [isOpen, selectedParticipants])

  const loadData = useCallback(async () => {
    if (!isOpen) return
    try {
      // Load config and SIDs in parallel
      const [configRes, sidRes] = await Promise.all([
        fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get-whatsapp-config" }),
        }),
        fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get-twilio-template-sids" }),
        }),
      ])
      const configData = await configRes.json()
      if (configRes.ok && configData?.success && configData?.whatsapp_config) {
        setConfig(configData.whatsapp_config)
      }
      const sidData = await sidRes.json()
      if (sidRes.ok && sidData?.success && sidData?.templateSids) {
        setEnvSids(sidData.templateSids)
      }
    } catch (e) {
      console.error("Failed to load config/SIDs", e)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setResult(null)
      setError("")
      setReviewing(false)
      loadData()
    }
  }, [isOpen, loadData])

  useEffect(() => {
    loadSendHistory(currentSid)
  }, [currentSid, loadSendHistory])

  useEffect(() => {
    if (!isOpen || submittedSids.length === 0) {
      setDeliveryStatuses({})
      setDeliveryError("")
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    const poll = async () => {
      attempts += 1
      const statuses = await refreshDeliveryStatuses(submittedSids)
      if (cancelled || !statuses) return
      const terminal = new Set(["delivered", "read", "failed", "undelivered"])
      const allTerminal = submittedSids.every(sid => terminal.has(String(statuses[sid]?.status || "queued").toLowerCase()))
      // Poll for up to five minutes; late callbacks remain available through
      // the manual Refresh button.
      if (!allTerminal && attempts < 60) timer = setTimeout(poll, 5000)
    }
    poll()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // The SID list only changes when a new bulk result replaces the old one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, result, refreshDeliveryStatuses])

  const buildVariables = (p: any) => {
    const name = resolveParticipantName(p)
    const cfg = config || {}

    if (templateType === 'reminder') {
      return {
        1: name,
        2: cfg.eventDateText || 'TBD',
        3: cfg.eventTimeText || 'TBD',
        4: cfg.locationName || 'TBD',
        5: cfg.mapUrl || 'https://maps.google.com',
      }
    }

    if (templateType === 'payment') {
      return {
        1: name,
        2: String(cfg.earlyPrice || '0'),
        3: cfg.latePriceSwitchLabel || 'TBD',
        4: String(cfg.latePrice || '0'),
        5: cfg.stcPay || 'TBD',
        6: cfg.bankName || 'TBD',
        7: cfg.iban || 'TBD',
      }
    }

    if (templateType === 'seat_payment_deadline') {
      return {
        1: name,
        2: '11:59 مساءً',
      }
    }

    if (templateType === 'survey_update') {
      return { 1: name }
    }

    return buildMatchTemplateVariables(p, cfg)
  }

  const handleSend = async () => {
    if (!currentSid) {
      setError(templateType === 'seat_payment_deadline'
        ? 'No SID configured for the seat payment reminder. Configure its Content SID in the Twilio admin tab.'
        : `No SID configured for ${templateType} template. Set TWILIO_${templateType.toUpperCase()}_TEMPLATE_SID in Vercel env.`)
      return
    }
    if (eligibleList.length === 0) {
      setError("No eligible participants with phone numbers in selection.")
      return
    }
    setSending(true)
    setResult(null)
    setDeliveryStatuses({})
    setDeliveryError("")
    setError("")
    try {
      const variablesMap: Record<string, any> = {}
      for (const p of eligibleList) {
        variablesMap[String(p.assigned_number)] = buildVariables(p)
      }

      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk-twilio-whatsapp",
          templateKey: templateType,
          templateSid: currentSid,
          participantNumbers: eligibleList.map(p => p.assigned_number),
          variablesMap,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setResult({ successCount: data.successCount, failCount: data.failCount, skippedCount: data.skippedCount || 0, results: data.results })
        setReviewing(false)
        await loadSendHistory(currentSid)
      } else {
        setError(data.error || "Bulk send failed")
      }
    } catch (e: any) {
      setError(e?.message || "Network error")
    } finally {
      setSending(false)
    }
  }

  if (!isOpen) return null

  const templateName = templateType === 'match'
    ? 'match_notification_v4'
    : templateType === 'reminder'
      ? 'event_reminder'
      : templateType === 'payment'
        ? 'payment_reminder'
        : templateType === 'seat_payment_deadline'
          ? 'seat_payment_deadline'
          : 'copy_of_complete_new_survey_questions'
  const requiredVariableCount = templateType === 'match'
    ? 7
    : templateType === 'reminder'
      ? 5
      : templateType === 'payment'
        ? 7
        : templateType === 'seat_payment_deadline'
          ? 2
          : 1
  const previewParticipant = eligibleList[0] || null
  const previewVariables: Record<string, any> = previewParticipant ? buildVariables(previewParticipant) : {}
  const missingVariables = Array.from({ length: requiredVariableCount }, (_, index) => String(index + 1)).filter(key => {
    const value = previewVariables[key]
    return value == null || String(value).trim() === '' || value === 'TBD' || value === 'N/A'
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 md:p-4">
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Bulk WhatsApp Send</h2>
              <p className="text-xs text-white/50">{selectedParticipants.size} participants selected</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {reviewing && (
          <div className="absolute inset-0 z-20 bg-slate-950 flex flex-col">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-lg">Review bulk send</h3>
                <p className="text-xs text-white/45">Nothing is sent until you confirm</p>
              </div>
              <button onClick={() => setReviewing(false)} className="p-2 rounded-lg hover:bg-white/10 text-white/60"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-green-500/10 border border-green-500/25 p-3 text-center"><p className="text-xl font-black text-green-400">{eligibleList.length}</p><p className="text-[10px] text-green-300/60">Will receive</p></div>
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-center"><p className="text-xl font-black text-amber-400">{withoutPhone.length}</p><p className="text-[10px] text-amber-300/60">Skipped</p></div>
                <div className={`rounded-xl border p-3 text-center ${missingVariables.length ? 'bg-red-500/10 border-red-500/25' : 'bg-blue-500/10 border-blue-500/25'}`}><p className={`text-xl font-black ${missingVariables.length ? 'text-red-400' : 'text-blue-400'}`}>{missingVariables.length}</p><p className="text-[10px] text-white/45">Invalid fields</p></div>
              </div>

              {surveyComplete.length > 0 && (
                <div className="rounded-xl bg-blue-500/10 border border-blue-500/25 p-3 text-sm text-blue-300">
                  {surveyComplete.length} participant{surveyComplete.length === 1 ? '' : 's'} already completed the survey update. They are still included and can receive it again.
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-violet-500/10 border border-violet-500/25 p-3 text-center"><p className="text-xl font-black text-violet-300">{historyLoading ? '…' : historyAvailable ? sentBefore.length : '—'}</p><p className="text-[10px] text-violet-200/60">Sent this template before</p></div>
                <div className="rounded-xl bg-slate-500/10 border border-slate-500/25 p-3 text-center"><p className="text-xl font-black text-slate-200">{historyLoading ? '…' : historyAvailable ? notSentBefore.length : '—'}</p><p className="text-[10px] text-slate-300/60">Not sent before</p></div>
              </div>

              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
                <div className="flex justify-between gap-3 text-sm"><span className="text-white/45">Template</span><span className="text-white font-medium text-right">{templateName}</span></div>
                <div className="flex justify-between gap-3 text-sm"><span className="text-white/45">SID</span><code className="text-green-400 text-[11px] break-all text-right">{currentSid}</code></div>
                <div className="flex justify-between gap-3 text-sm"><span className="text-white/45">Variables</span><span className={missingVariables.length ? 'text-red-400' : 'text-green-400'}>{requiredVariableCount - missingVariables.length}/{requiredVariableCount} valid</span></div>
              </div>

              {missingVariables.length > 0 && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-300">
                  Missing or invalid template variables: {missingVariables.map(key => `{{${key}}}`).join(', ')}
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-white/60 mb-2">Recipients</p>
                <div className="max-h-32 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
                  {eligibleList.map(person => {
                    const previous = sendHistory[String(person.assigned_number)]
                    return <div key={person.assigned_number} className="px-3 py-2 flex items-center justify-between gap-3 text-xs"><span className="text-white">{person.name || `#${person.assigned_number}`}</span><span className="text-right"><span className="block text-white/40">#{person.assigned_number} · {person.phone_number}</span><span className={previous ? "text-violet-300" : "text-slate-500"}>{previous ? `Sent before${previous.count > 1 ? ` ×${previous.count}` : ''}${previous.lastStatus ? ` · ${previous.lastStatus}` : ''}${previous.lastSentAt ? ` · ${new Date(previous.lastSentAt).toLocaleString()}` : ''}` : historyAvailable ? 'Not sent before' : historyLoading ? 'Checking send history…' : 'Send history unavailable'}</span></span></div>
                  })}
                  {withoutPhone.map(person => <div key={person.assigned_number} className="px-3 py-2 flex justify-between text-xs bg-amber-500/5"><span className="text-amber-300">{person.name || `#${person.assigned_number}`}</span><span className="text-amber-500">Skipped · no phone</span></div>)}
                </div>
              </div>

              {previewParticipant && (
                <div>
                  <p className="text-xs font-semibold text-white/60 mb-2">Personalized preview · {previewParticipant.name || `#${previewParticipant.assigned_number}`}</p>
                  <div className="rounded-xl bg-black/25 border border-white/10 p-3 grid grid-cols-1 gap-1.5">
                    {Object.entries(previewVariables).map(([key, value]) => <div key={key} className="flex gap-2 text-xs"><code className="text-purple-400 w-10">{`{{${key}}}`}</code><span className="text-white/70 break-words min-w-0">{String(value)}</span></div>)}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex gap-3">
              <button onClick={() => setReviewing(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70">Back</button>
              <button onClick={handleSend} disabled={sending || missingVariables.length > 0 || !currentSid || eligibleList.length === 0}
                className="flex-[2] px-4 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold disabled:opacity-30 flex items-center justify-center gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending…' : `Confirm send to ${eligibleList.length}`}
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Template type selector */}
          <div>
            <label className="text-sm text-white/70 mb-2 block">Template Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['match', 'reminder', 'payment', 'seat_payment_deadline', 'survey_update'] as TemplateType[]).map(type => (
                <button
                  key={type}
                  onClick={() => { setTemplateType(type); setResult(null) }}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    templateType === type
                      ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white'
                      : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {type === 'match' && 'Match'}
                  {type === 'reminder' && 'Reminder'}
                  {type === 'payment' && 'Payment'}
                  {type === 'seat_payment_deadline' && 'Seat Payment Reminder'}
                  {type === 'survey_update' && 'Survey Completion'}
                </button>
              ))}
            </div>
          </div>

          {/* SID display */}
          <div>
            <label className="text-sm text-white/70 mb-2 block">Configured Template SID</label>
            {currentSid ? (
              <div className="flex items-center gap-2 bg-green-900/20 border border-green-600/30 rounded-xl px-3 py-2.5">
                <Zap className="w-4 h-4 text-green-400 flex-shrink-0" />
                <code className="text-sm text-green-400 font-mono">{currentSid}</code>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-amber-900/20 border border-amber-600/30 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="text-xs text-amber-400">
                  {templateType === 'seat_payment_deadline'
                    ? 'Not configured. Add its Content SID in the Twilio admin tab.'
                    : <>Not configured. Set <code className="font-mono">TWILIO_{templateType.toUpperCase()}_TEMPLATE_SID</code> in Vercel.</>}
                </span>
              </div>
            )}
          </div>

          {/* Eligibility summary */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/60">Selected:</span>
              <span className="text-white font-medium">{selectedList.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/60">With phone number:</span>
              <span className="text-green-400 font-medium">{eligibleList.length}</span>
            </div>
            {withoutPhone.length > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Without phone:</span>
                <span className="text-amber-400 font-medium">{withoutPhone.length} (skipped)</span>
              </div>
            )}
            {surveyComplete.length > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Survey already complete:</span>
                <span className="text-blue-400 font-medium">{surveyComplete.length} (included)</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/60">Sent this template before:</span>
              <span className="text-violet-300 font-medium">{historyLoading ? 'Checking…' : historyAvailable ? sentBefore.length : 'Unavailable'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/60">Not sent before:</span>
              <span className="text-slate-300 font-medium">{historyLoading ? 'Checking…' : historyAvailable ? notSentBefore.length : 'Unavailable'}</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-red-400">{error}</span>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-900/20 border border-green-600/30 rounded-xl p-3 text-center">
                  <CheckCircle2 className="w-6 h-6 text-green-400 mx-auto mb-1" />
                  <div className="text-2xl font-bold text-green-400">{result.successCount}</div>
                  <div className="text-xs text-green-300/70">Accepted by Twilio</div>
                </div>
                <div className="bg-red-900/20 border border-red-600/30 rounded-xl p-3 text-center">
                  <XCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
                  <div className="text-2xl font-bold text-red-400">{result.failCount}</div>
                  <div className="text-xs text-red-300/70">Failed</div>
                </div>
                <div className="bg-amber-900/20 border border-amber-600/30 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-amber-400">{result.skippedCount}</div>
                  <div className="text-xs text-amber-300/70">Skipped</div>
                </div>
              </div>

              {submittedResults.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">Actual delivery status</p>
                      <p className="text-[11px] text-white/45">Marketing delivery is only confirmed after a delivered/read callback. Pending results auto-refresh every 5 seconds.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => refreshDeliveryStatuses(submittedSids)}
                      disabled={deliveryLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/70 disabled:opacity-40"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${deliveryLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-2 text-center"><p className="text-xl font-black text-emerald-300">{deliveredCount}</p><p className="text-[10px] text-emerald-200/60">Delivered/read</p></div>
                    <div className="rounded-lg bg-red-500/10 border border-red-500/25 p-2 text-center"><p className="text-xl font-black text-red-300">{deliveryFailedCount + result.failCount}</p><p className="text-[10px] text-red-200/60">Failed</p></div>
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-2 text-center"><p className="text-xl font-black text-amber-300">{deliveryPendingCount}</p><p className="text-[10px] text-amber-200/60">Pending</p></div>
                  </div>

                  <div className={`rounded-lg border px-3 py-2 text-xs ${deliveryPendingCount === 0 && deliveryFailedCount === 0 && result.failCount === 0 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : deliveryFailedCount > 0 || result.failCount > 0 ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
                    {deliveryPendingCount === 0 && deliveryFailedCount === 0 && result.failCount === 0
                      ? `All ${submittedResults.length} messages are confirmed delivered.`
                      : deliveryFailedCount > 0 || result.failCount > 0
                        ? `${deliveredCount} delivered, ${deliveryFailedCount + result.failCount} failed, ${deliveryPendingCount} still pending.`
                        : `${deliveryPendingCount} message${deliveryPendingCount === 1 ? ' is' : 's are'} still pending; Twilio acceptance does not guarantee delivery.`}
                  </div>
                  {deliveryError && <p className="text-xs text-red-300">{deliveryError}</p>}
                </div>
              )}

              {result.results.length > 0 && (
                <div className="max-h-40 overflow-y-auto bg-slate-950/50 rounded-xl p-3 space-y-1">
                  {result.results.map((r: any, i: number) => {
                    const delivery = r.sid ? deliveryStatuses[String(r.sid)] : null
                    const status = String(delivery?.status || r.status || (r.success ? 'accepted' : 'failed')).toLowerCase()
                    const confirmed = status === 'delivered' || status === 'read'
                    const failed = status === 'failed' || status === 'undelivered' || !r.success
                    return (
                    <div key={i} className={`text-xs flex items-start gap-2 ${r.skipped ? 'text-amber-400' : confirmed ? 'text-green-400' : failed ? 'text-red-400' : 'text-amber-300'}`}>
                      <span>#{r.number}</span>
                      <span className="text-white/50">{r.name}</span>
                      <span>{r.skipped ? `Skipped: ${r.reason}` : confirmed ? `✅ ${status}` : failed ? `❌ ${delivery?.errorMessage || r.error || status}${delivery?.errorCode ? ` (${delivery.errorCode})` : ''}` : `⏳ ${status}`}</span>
                    </div>
                  )})}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 text-sm transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => setReviewing(true)}
            disabled={sending || !currentSid || eligibleList.length === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Review {eligibleList.length} recipients
          </button>
        </div>
      </div>
    </div>
  )
}
