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
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/20 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/20">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-2 rounded-xl">
              <QrCode className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">رمز QR للمشارك</h2>
              <p className="text-slate-400 text-sm">المشارك #{participant.assigned_number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all duration-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Participant Info */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-center space-y-2">
              <div className="text-3xl font-bold text-white">#{participant.assigned_number}</div>
              {participant.name && (
                <div className="text-lg text-slate-300">{participant.name}</div>
              )}
              {participant.phone && (
                <div className="text-sm text-slate-400">{participant.phone}</div>
              )}
            </div>
          </div>

          {/* QR Code */}
          {participant.secure_token ? (
            <div className="bg-white p-6 rounded-xl flex items-center justify-center">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(formUrl)}`}
                alt="QR Code"
                className="w-[200px] h-[200px]"
              />
            </div>
          ) : (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
              <p className="text-red-400">لا يوجد رمز آمن لهذا المشارك</p>
              <p className="text-red-300 text-sm mt-2">قم بإنشاء رابط جديد للمشارك</p>
            </div>
          )}

          {/* URL Display */}
          {participant.secure_token && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 mb-1">رابط النموذج</p>
                  <p className="text-sm text-slate-300 truncate font-mono">{formUrl}</p>
                </div>
                <button
                  onClick={copyToClipboard}
                  className="flex-shrink-0 p-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 transition-all duration-200"
                  title="نسخ الرابط"
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

          {/* Instructions */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <p className="text-amber-300 text-sm text-center">
              <strong>ملاحظة:</strong> يمكن للمشارك مسح رمز QR هذا أو استخدام الرابط للوصول إلى نموذج التسجيل
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/20">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-xl transition-all duration-300"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}
