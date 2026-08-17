import type { KeyboardEvent } from "react"
import { CheckCircle, ChevronLeft, Copy, MessageSquare, Send, X } from "lucide-react"

export type ParticipantOtpOrigin = "recovery" | "signup-duplicate"
export type ParticipantOtpStep = "phone" | "otp" | "success"

interface ParticipantOtpModalProps {
  open: boolean
  origin: ParticipantOtpOrigin
  step: ParticipantOtpStep
  phone: string
  otp: string
  loading: boolean
  error: string | null
  recoveredToken: string
  recoveredName: string
  recoveredNumber: number | null
  tokenCopied: boolean
  onClose: () => void
  onPhoneChange: (value: string) => void
  onOtpChange: (value: string) => void
  onRequestOtp: () => void | Promise<void>
  onVerifyOtp: () => void | Promise<void>
  onBackToPhone: () => void
  onCopyToken: () => void
  onContinue: () => void
}

export function ParticipantOtpModal({
  open,
  origin,
  step,
  phone,
  otp,
  loading,
  error,
  recoveredToken,
  recoveredName,
  recoveredNumber,
  tokenCopied,
  onClose,
  onPhoneChange,
  onOtpChange,
  onRequestOtp,
  onVerifyOtp,
  onBackToPhone,
  onCopyToken,
  onContinue,
}: ParticipantOtpModalProps) {
  if (!open) return null

  const isDuplicateSignup = origin === "signup-duplicate"
  const handleOtpKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !loading && otp.trim()) {
      event.preventDefault()
      void onVerifyOtp()
    }
  }

  return (
    <div
      data-welcome-dialog
      role="dialog"
      aria-modal="true"
      aria-label={isDuplicateSignup ? "التحقق من الحساب الحالي" : "استعادة رمز الدخول"}
      tabIndex={-1}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-600/50 bg-gradient-to-br from-slate-800/95 to-slate-900/95 p-6 shadow-2xl backdrop-blur-xl" dir="rtl">
        <button
          data-dialog-close
          aria-label="إغلاق نافذة التحقق"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 shadow-lg">
            <MessageSquare className="h-8 w-8 text-white" />
          </div>
          <h3 className="mb-2 text-xl font-bold text-white">
            {isDuplicateSignup ? "هذا الرقم مسجل بالفعل" : "استرجاع الرمز المميز"}
          </h3>
          <p className="text-sm text-slate-300">
            {isDuplicateSignup
              ? "تحقق من رقم جوالك للدخول إلى حسابك الحالي بدل إنشاء حساب جديد."
              : "سنرسل رمز تحقق إلى رقم جوالك عبر الرسائل القصيرة"}
          </p>
        </div>

        {step === "success" ? (
          <div className="space-y-4">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-green-500 to-emerald-500 shadow-lg">
                <CheckCircle className="h-8 w-8 text-white" />
              </div>
              <h4 className="mb-1 text-lg font-bold text-white">تم استعادة بياناتك!</h4>
              {recoveredName && <p className="mb-1 text-sm text-slate-300">{recoveredName}</p>}
              {recoveredNumber !== null && <p className="mb-4 text-xs text-slate-400">رقم المشارك: #{recoveredNumber}</p>}
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-300">الرمز المميز الخاص بك</label>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={recoveredToken}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-center font-mono text-sm tracking-wider text-white focus:outline-none"
                  dir="ltr"
                />
                <button
                  onClick={onCopyToken}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg bg-cyan-600/20 p-2 text-cyan-300 transition-colors hover:bg-cyan-600/30"
                  title="نسخ"
                >
                  {tokenCopied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-amber-300/70">احفظ هذا الرمز في مكان آمن — ستحتاجه للدخول</p>
            </div>
            <button
              onClick={onContinue}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-700 px-4 py-3 font-medium text-white transition-all duration-300 hover:from-green-700 hover:to-emerald-800"
            >
              <span>المتابعة</span>
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </button>
          </div>
        ) : step === "phone" ? (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-slate-300">رقم الجوال</label>
              <input
                type="tel"
                value={phone}
                onChange={(event) => onPhoneChange(event.target.value)}
                readOnly={isDuplicateSignup}
                placeholder="مثال: 0501234567"
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-sm text-white placeholder-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                dir="ltr"
              />
            </div>
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-300" role="alert">
                {error}
              </div>
            )}
            <button
              onClick={() => void onRequestOtp()}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-700 px-4 py-3 font-medium text-white transition-all duration-300 hover:from-cyan-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span>جاري الإرسال...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>إرسال رمز التحقق</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-slate-300">رمز التحقق</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) => onOtpChange(event.target.value)}
                onKeyDown={handleOtpKeyDown}
                placeholder="أدخل الرقم المكون من 6 أرقام"
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-center text-lg tracking-widest text-white placeholder-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                dir="ltr"
                maxLength={6}
                autoFocus
              />
            </div>
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-300" role="alert">
                {error}
              </div>
            )}
            <button
              onClick={() => void onVerifyOtp()}
              disabled={loading || !otp.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-700 px-4 py-3 font-medium text-white transition-all duration-300 hover:from-green-700 hover:to-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span>جاري التحقق...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span>تحقق واستعادة</span>
                </>
              )}
            </button>
            <button
              onClick={onBackToPhone}
              disabled={loading}
              className="w-full px-4 py-2 text-sm text-slate-400 transition-colors hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              إعادة إرسال الرمز
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
