import { useState, useEffect, useCallback } from "react"
import { X, Send, Loader2, Users, AlertCircle, CheckCircle2, XCircle, Zap } from "lucide-react"

interface BulkWhatsAppModalProps {
  isOpen: boolean
  onClose: () => void
  selectedParticipants: Set<number>
  participants: any[]
}

type TemplateType = 'match' | 'reminder' | 'payment'

export default function BulkWhatsAppModal({ isOpen, onClose, selectedParticipants, participants }: BulkWhatsAppModalProps) {
  const [templateType, setTemplateType] = useState<TemplateType>('match')
  const [envSids, setEnvSids] = useState<{ match: string | null; reminder: string | null; payment: string | null }>({ match: null, reminder: null, payment: null })
  const [config, setConfig] = useState<any>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ successCount: number; failCount: number; results: any[] } | null>(null)
  const [error, setError] = useState("")

  const currentSid = envSids[templateType]
  const selectedList = participants.filter(p => selectedParticipants.has(p.assigned_number))
  const eligibleList = selectedList.filter(p => p.phone_number)
  const withoutPhone = selectedList.filter(p => !p.phone_number)

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
      const savings = Math.max(Number(cfg.latePrice) - Number(cfg.earlyPrice), 0)
      return {
        1: name,
        2: String(cfg.earlyPrice || '0'),
        3: cfg.latePriceSwitchLabel || 'TBD',
        4: String(cfg.latePrice || '0'),
        5: String(savings || '0'),
        6: cfg.stcPay || 'TBD',
        7: cfg.bankName || 'TBD',
        8: cfg.iban || 'TBD',
      }
    }

    // match
    return {
      1: name,
      2: String(cfg.earlyPrice || '0'),
      3: cfg.latePriceSwitchLabel || 'TBD',
      4: String(cfg.latePrice || '0'),
      5: cfg.stcPay || 'TBD',
      6: cfg.bankName || 'TBD',
      7: cfg.iban || 'TBD',
      8: cfg.locationName || 'TBD',
      9: cfg.eventDateText || 'TBD',
      10: cfg.eventTimeText || 'TBD',
      11: cfg.arrivalTimeText || 'TBD',
      12: cfg.mapUrl || 'https://maps.google.com',
      13: String(p.assigned_number || '0'),
      14: String(p.secure_token || 'N/A'),
      15: 'https://meetu.ps/e/Q9zQM/Lh7Kd/i',
    }
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
    if (!confirm(`Send ${templateType} template to ${eligibleList.length} participants?`)) return

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
          templateSid: currentSid,
          participantNumbers: eligibleList.map(p => p.assigned_number),
          variablesMap,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setResult({ successCount: data.successCount, failCount: data.failCount, results: data.results })
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 md:p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Template type selector */}
          <div>
            <label className="text-sm text-white/70 mb-2 block">Template Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['match', 'reminder', 'payment'] as TemplateType[]).map(type => (
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
                </button>
              ))}
            </div>
          </div>

          {/* SID display */}
          <div>
            <label className="text-sm text-white/70 mb-2 block">Template SID (from env)</label>
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
              <div className="grid grid-cols-2 gap-3">
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
              </div>
              {result.results.length > 0 && (
                <div className="max-h-40 overflow-y-auto bg-slate-950/50 rounded-xl p-3 space-y-1">
                  {result.results.map((r: any, i: number) => (
                    <div key={i} className={`text-xs flex items-center gap-2 ${r.success ? 'text-green-400' : 'text-red-400'}`}>
                      <span>#{r.number}</span>
                      <span className="text-white/50">{r.name}</span>
                      <span>{r.success ? '✅' : `❌ ${r.error}`}</span>
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
            onClick={handleSend}
            disabled={sending || !currentSid || eligibleList.length === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Sending..." : `Send to ${eligibleList.length} participants`}
          </button>
        </div>
      </div>
    </div>
  )
}
