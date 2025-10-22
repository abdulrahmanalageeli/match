import { X, QrCode, Copy, Check } from "lucide-react"
import { useState } from "react"

interface ParticipantQRModalProps {
  isOpen: boolean
  onClose: () => void
  participant: any
}

export default function ParticipantQRModal({ isOpen, onClose, participant }: ParticipantQRModalProps) {
  const [copied, setCopied] = useState(false)

  if (!isOpen || !participant) return null

  const formUrl = `${window.location.origin}/welcome?token=${participant.secure_token}`

  const copyToClipboard = () => {
    navigator.clipboard.writeText(formUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/20 rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/20 sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-2 rounded-lg">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">رمز QR</h2>
              <p className="text-slate-400 text-xs">#{participant.assigned_number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all duration-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Participant Info - Compact */}
          {participant.name && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-2 text-center">
              <div className="text-base font-semibold text-white">{participant.name}</div>
              {participant.phone && (
                <div className="text-xs text-slate-400">{participant.phone}</div>
              )}
            </div>
          )}

          {/* QR Code - Smaller */}
          {participant.secure_token ? (
            <div className="bg-white p-4 rounded-lg flex items-center justify-center">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(formUrl)}`}
                alt="QR Code"
                className="w-[180px] h-[180px]"
              />
            </div>
          ) : (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
              <p className="text-red-400 text-sm">لا يوجد رمز آمن</p>
            </div>
          )}

          {/* URL Display - Compact */}
          {participant.secure_token && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300 truncate font-mono">{formUrl}</p>
                </div>
                <button
                  onClick={copyToClipboard}
                  className="flex-shrink-0 p-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 transition-all duration-200"
                  title="نسخ"
                >
                  {copied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Close Button - Inside content */}
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-lg transition-all duration-300 text-sm"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}
