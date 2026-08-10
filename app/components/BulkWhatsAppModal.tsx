import { useState, useEffect, useCallback } from "react"
import { X, Send, Loader2, Users, AlertCircle, CheckCircle2, XCircle, Zap } from "lucide-react"
import { buildMatchTemplateVariables } from "~/utils/twilioTemplateVariables"
import { getParticipantMatchInsightsCompletion } from "~/lib/matchControl"

interface BulkWhatsAppModalProps {
  isOpen: boolean
  onClose: () => void
  selectedParticipants: Set<number>
  participants: any[]
}

type TemplateType = 'match' | 'reminder' | 'payment' | 'survey_update'

type TemplateSids = Record<TemplateType, string | null>

export default function BulkWhatsAppModal({ isOpen, onClose, selectedParticipants, participants }: BulkWhatsAppModalProps) {
  const [templateType, setTemplateType] = useState<TemplateType>('match')
  const [envSids, setEnvSids] = useState<TemplateSids>({ match: null, reminder: null, payment: null, survey_update: null })
  const [config, setConfig] = useState<any>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ successCount: number; failCount: number; skippedCount: number; results: any[] } | null>(null)
  const [error, setError] = useState("")
  const [reviewing, setReviewing] = useState(false)

  const currentSid = envSids[templateType]
  const selectedList = participants.filter(p => selectedParticipants.has(p.assigned_number))
  const surveyComplete = templateType === 'survey_update'
    ? selectedList.filter(p => getParticipantMatchInsightsCompletion(p).complete)
    : []
  const targetList = templateType === 'survey_update'
    ? selectedList.filter(p => !getParticipantMatchInsightsCompletion(p).complete)
    : selectedList
  const eligibleList = targetList.filter(p => p.phone_number)
  const withoutPhone = targetList.filter(p => !p.phone_number)

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

  const buildVariables = (p: any) => {
    const name = p.name || p.survey_data?.name || `المشارك #${p.assigned_number}`
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

    if (templateType === 'survey_update') {
      return { 1: name }
    }

    return buildMatchTemplateVariables(p, cfg)
  }

  const handleSend = async () => {
    if (!currentSid) {
      setError(`No SID configured for ${templateType} template. Set TWILIO_${templateType.toUpperCase()}_TEMPLATE_SID in Vercel env.`)
      return
    }
    if (eligibleList.length === 0) {
      setError("No eligible participants with phone numbers in selection.")
      return
    }
    setSending(true)
    setResult(null)
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
        : 'copy_of_complete_new_survey_questions'
  const requiredVariableCount = templateType === 'match' ? 7 : templateType === 'reminder' ? 5 : templateType === 'payment' ? 7 : 1
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
                  {surveyComplete.length} participant{surveyComplete.length === 1 ? '' : 's'} already completed the survey update and will be skipped.
                </div>
              )}

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
                  {eligibleList.map(person => <div key={person.assigned_number} className="px-3 py-2 flex justify-between text-xs"><span className="text-white">{person.name || `#${person.assigned_number}`}</span><span className="text-white/40">#{person.assigned_number} · {person.phone_number}</span></div>)}
                  {withoutPhone.map(person => <div key={person.assigned_number} className="px-3 py-2 flex justify-between text-xs bg-amber-500/5"><span className="text-amber-300">{person.name || `#${person.assigned_number}`}</span><span className="text-amber-500">Skipped · no phone</span></div>)}
                  {surveyComplete.map(person => <div key={person.assigned_number} className="px-3 py-2 flex justify-between text-xs bg-blue-500/5"><span className="text-blue-300">{person.name || `#${person.assigned_number}`}</span><span className="text-blue-400">Skipped · survey complete</span></div>)}
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
              {(['match', 'reminder', 'payment', 'survey_update'] as TemplateType[]).map(type => (
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
                  Not configured. Set <code className="font-mono">TWILIO_{templateType.toUpperCase()}_TEMPLATE_SID</code> in Vercel.
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
                <span className="text-blue-400 font-medium">{surveyComplete.length} (skipped)</span>
              </div>
            )}
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
                  <div className="text-xs text-green-300/70">Sent</div>
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
              {result.results.length > 0 && (
                <div className="max-h-40 overflow-y-auto bg-slate-950/50 rounded-xl p-3 space-y-1">
                  {result.results.map((r: any, i: number) => (
                    <div key={i} className={`text-xs flex items-center gap-2 ${r.skipped ? 'text-amber-400' : r.success ? 'text-green-400' : 'text-red-400'}`}>
                      <span>#{r.number}</span>
                      <span className="text-white/50">{r.name}</span>
                      <span>{r.skipped ? `Skipped: ${r.reason}` : r.success ? '✅' : `❌ ${r.error}`}</span>
                    </div>
                  ))}
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
