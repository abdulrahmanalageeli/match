import React from "react"

interface HistoryItem {
  partner_number: number
  partner_name?: string
  event_id?: number
}

interface ParticipantHoverCardContentProps {
  participantNumber: number
  participantName?: string
  pData?: any
  history?: HistoryItem[]
  currentEventId?: number
}

export default function ParticipantHoverCardContent({
  participantNumber,
  participantName,
  pData,
  history = [],
  currentEventId = 1,
}: ParticipantHoverCardContentProps) {
  const surveyData = pData?.survey_data || {}
  const answers = surveyData.answers || {}

  const relativeUpdatedAt = (() => {
    if (!pData?.updated_at) return null
    try {
      const utcDate = new Date(pData.updated_at)
      const gmt3Date = new Date(utcDate.getTime() + 3 * 60 * 60 * 1000)
      const now = new Date()
      const diffMs = now.getTime() - gmt3Date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)
      if (diffMins < 1) return "Just now"
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffHours < 24) return `${diffHours}h ago`
      if (diffDays === 1) return "1d ago"
      if (diffDays < 30) return `${diffDays}d ago`
      return gmt3Date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    } catch {
      return null
    }
  })()

  const genderPrefLabel = (() => {
    const raw = answers.actual_gender_preference || answers.gender_preference
    if (raw === "any_gender" || pData?.any_gender_preference) return "أي جنس"
    if (raw === "same_gender" || pData?.same_gender_preference) return "نفس الجنس فقط"
    if (raw === "opposite_gender") return "الجنس المقابل"
    if (pData?.any_gender_preference) return "أي جنس"
    if (pData?.same_gender_preference) return "نفس الجنس فقط"
    return "الجنس المقابل"
  })()

  const agePrefLabel = (() => {
    const open = answers.open_age_preference === "true" || answers.open_age_preference === true || pData?.open_age_preference
    if (open) return "مفتوح: بدون قيود عمرية"
    const min = answers.preferred_age_min ?? pData?.preferred_age_min
    const max = answers.preferred_age_max ?? pData?.preferred_age_max
    if (min && max) return `من ${min} إلى ${max}`
    if (min) return `من ${min}+`
    if (max) return `حتى ${max}`
    return "غير محدد"
  })()

  const nationalityLabel = answers.nationality || pData?.nationality || "غير محدد"
  const nationalityPrefLabel = (() => {
    const pref = answers.nationality_preference
    if (pref === "same") return "نفس الجنسية"
    if (pref === "any") return "أي جنسية"
    if (typeof pData?.prefer_same_nationality === "boolean") {
      return pData.prefer_same_nationality ? "نفس الجنسية" : "أي جنسية"
    }
    return "غير محدد"
  })()

  return (
    <div className="space-y-2" dir="rtl">
      {/* Header */}
      <div className="border-b border-cyan-400/20 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-cyan-300 font-bold text-lg">{participantName || "غير محدد"}</span>
            <span className="text-slate-400 text-sm">#{participantNumber}</span>
          </div>
          {relativeUpdatedAt && (
            <span className="text-xs text-slate-500">🕐 {relativeUpdatedAt}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="text-slate-400">
            العمر: <span className="text-white">{answers.age || surveyData.age || pData?.age || "غير محدد"}</span>
          </span>
          <span className="text-slate-400">
            MBTI: <span className="text-white">{pData?.mbti_personality_type || answers.mbti || "غير محدد"}</span>
          </span>
          <span className="text-slate-400">
            تفضيل الجنس: <span className="text-white">{genderPrefLabel}</span>
          </span>
          <span className="text-slate-400">
            تفضيل العمر: <span className="text-white">{agePrefLabel}</span>
          </span>
          <span className="text-slate-400">
            الجنسية: <span className="text-white">{nationalityLabel}</span>
          </span>
          <span className="text-slate-400">
            تفضيل الجنسية: <span className="text-white">{nationalityPrefLabel}</span>
          </span>
        </div>
      </div>

      {/* Main Content - 2 Column Layout */}
      <div className="grid grid-cols-3 gap-4">
        {/* Left Column - Vibe Info */}
        <div className="col-span-2 space-y-1.5">
          <div className="text-cyan-300 font-semibold text-xs mb-1">الطاقة والشخصية:</div>
          {answers.vibe_1 && (
            <div className="text-xs">
              <span className="text-slate-400">الويكند المثالي:</span>
              <span className="text-white ml-1">{answers.vibe_1}</span>
            </div>
          )}
          {answers.vibe_2 && (
            <div className="text-xs">
              <span className="text-slate-400">الهوايات:</span>
              <span className="text-white ml-1">{answers.vibe_2}</span>
            </div>
          )}
          {answers.vibe_3 && (
            <div className="text-xs">
              <span className="text-slate-400">الفنان المفضل:</span>
              <span className="text-white ml-1">{answers.vibe_3}</span>
            </div>
          )}
          {answers.vibe_4 && (
            <div className="text-xs">
              <span className="text-slate-400">السوالف العميقة:</span>
              <span className="text-white ml-1">{answers.vibe_4}</span>
            </div>
          )}
          {answers.vibe_5 && (
            <div className="text-xs">
              <span className="text-slate-400">كيف يصفك أصدقاؤك:</span>
              <span className="text-white ml-1">{answers.vibe_5}</span>
            </div>
          )}
          {answers.vibe_6 && (
            <div className="text-xs">
              <span className="text-slate-400">كيف تصف أصدقاءك:</span>
              <span className="text-white ml-1">{answers.vibe_6}</span>
            </div>
          )}
        </div>

        {/* Right Column - Previous Matches */}
        {history && history.length > 0 && (
          <div className="border-l border-cyan-400/20 pl-4">
            <div className="text-cyan-300 font-semibold text-xs mb-1">Previous Matches:</div>
            <div className="space-y-0.5">
              {history.slice(0, 5).map((m, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs bg-white/5 rounded px-1.5 py-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-cyan-400">#{m.partner_number}</span>
                    <span className="text-slate-400 truncate max-w-[100px]">{m.partner_name}</span>
                  </div>
                  {m.event_id && m.event_id !== currentEventId && (
                    <span className="text-xs text-purple-400">E{m.event_id}</span>
                  )}
                </div>
              ))}
              {history.length > 5 && (
                <div className="text-xs text-slate-500 text-center">+{history.length - 5} more</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
