import React, { useMemo } from "react"
import { MessageSquare, Users, Clock, Sparkles, ChevronLeft } from "lucide-react"

interface HistoryItem {
  partner_number: number
  partner_name?: string
  event_id?: number
}

interface Impression {
  from_number: number
  from_name: string
  text: string
  event_id: number
  phase: string
}

interface ParticipantHoverCardContentProps {
  participantNumber: number
  participantName?: string
  pData?: any
  history?: HistoryItem[]
  currentEventId?: number
  impressions?: Impression[]
}

function timeAgo(dateStr: string | null): string | null {
  if (!dateStr) return null
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(diff / 86400000)
    if (days === 1) return "1d ago"
    if (days < 30) return `${days}d ago`
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
  } catch {
    return null
  }
}

function InfoPill({ label, value }: { label: string; value: string }) {
  if (!value || value === "غير محدد") return null
  return (
    <div className="flex items-center gap-1.5 bg-white/[0.04] rounded-md px-2 py-1">
      <span className="text-slate-500 text-[10px]">{label}</span>
      <span className="text-slate-200 text-[10px] font-medium truncate max-w-[120px]">{value}</span>
    </div>
  )
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-cyan-400/80">{icon}</span>
      <span className="text-cyan-300/90 text-[11px] font-semibold tracking-wide uppercase">{children}</span>
    </div>
  )
}

export default function ParticipantHoverCardContent({
  participantNumber,
  participantName,
  pData,
  history = [],
  currentEventId = 1,
  impressions = [],
}: ParticipantHoverCardContentProps) {
  const surveyData = pData?.survey_data || {}
  const answers = surveyData.answers || {}

  const computed = useMemo(() => {
    const genderPref = (() => {
      const raw = answers.actual_gender_preference || answers.gender_preference
      if (raw === "any_gender" || pData?.any_gender_preference) return "أي جنس"
      if (raw === "same_gender" || pData?.same_gender_preference) return "نفس الجنس"
      if (raw === "opposite_gender") return "الجنس المقابل"
      if (pData?.any_gender_preference) return "أي جنس"
      if (pData?.same_gender_preference) return "نفس الجنس"
      return "الجنس المقابل"
    })()

    const agePref = (() => {
      const open = answers.open_age_preference === "true" || answers.open_age_preference === true || pData?.open_age_preference
      if (open) return "مفتوح"
      const min = answers.preferred_age_min ?? pData?.preferred_age_min
      const max = answers.preferred_age_max ?? pData?.preferred_age_max
      if (min && max) return `${min}-${max}`
      if (min) return `${min}+`
      if (max) return `≤${max}`
      return "غير محدد"
    })()

    const nationality = answers.nationality || pData?.nationality || "غير محدد"
    const natPref = (() => {
      const pref = answers.nationality_preference
      if (pref === "same") return "نفس الجنسية"
      if (pref === "any") return "أي جنسية"
      if (typeof pData?.prefer_same_nationality === "boolean") return pData.prefer_same_nationality ? "نفس الجنسية" : "أي جنسية"
      return "غير محدد"
    })()

    const intentGoal = answers.intent_goal || pData?.intent_goal || "غير محدد"
    const openIntentMismatch = answers.open_intent_goal_mismatch === true || answers.open_intent_goal_mismatch === "true" || pData?.open_intent_goal_mismatch === true

    const vibes = [
      answers.vibe_1, answers.vibe_2, answers.vibe_3,
      answers.vibe_4, answers.vibe_5, answers.vibe_6,
    ].filter(Boolean)

    return {
      age: answers.age || surveyData.age || pData?.age || "غير محدد",
      mbti: pData?.mbti_personality_type || answers.mbti || "غير محدد",
      genderPref, agePref, nationality, natPref, intentGoal, openIntentMismatch, vibes,
      updatedAgo: timeAgo(pData?.updated_at || null),
      signupAgo: timeAgo(pData?.next_event_signup_timestamp || null),
    }
  }, [pData, answers])

  const visibleHistory = useMemo(() => history.slice(0, 5), [history])
  const visibleImpressions = useMemo(() => impressions.slice(0, 6), [impressions])

  return (
    <div className="w-[340px] space-y-3" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-base">{participantName || "غير محدد"}</span>
          <span className="text-slate-500 text-xs font-mono">#{participantNumber}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          {computed.updatedAgo && (
            <span className="flex items-center gap-0.5"><Clock size={9} />{computed.updatedAgo}</span>
          )}
          {computed.signupAgo && (
            <span className="flex items-center gap-0.5"><Sparkles size={9} />{computed.signupAgo}</span>
          )}
        </div>
      </div>

      {/* ── Quick Info Pills ── */}
      <div className="flex flex-wrap gap-1.5">
        <InfoPill label="العمر" value={computed.age} />
        <InfoPill label="MBTI" value={computed.mbti} />
        <InfoPill label="الجنس" value={computed.genderPref} />
        <InfoPill label="العمر" value={computed.agePref} />
        <InfoPill label="الجنسية" value={computed.nationality} />
        <InfoPill label="تفضيل الجنسية" value={computed.natPref} />
        <InfoPill label="الهدف" value={computed.intentGoal} />
        {computed.openIntentMismatch && (
          <div className="flex items-center gap-1 bg-amber-500/10 rounded-md px-2 py-1">
            <span className="text-amber-400/80 text-[10px]">يقبل اختلاف الهدف</span>
          </div>
        )}
      </div>

      {/* ── Vibe ── */}
      {computed.vibes.length > 0 && (
        <div>
          <SectionTitle icon={<Sparkles size={11} />}>الطاقة والشخصية</SectionTitle>
          <div className="space-y-1">
            {answers.vibe_1 && <div className="text-[11px] text-slate-400 truncate"><span className="text-slate-500">الويكند:</span> <span className="text-slate-200">{answers.vibe_1}</span></div>}
            {answers.vibe_2 && <div className="text-[11px] text-slate-400 truncate"><span className="text-slate-500">الهوايات:</span> <span className="text-slate-200">{answers.vibe_2}</span></div>}
            {answers.vibe_5 && <div className="text-[11px] text-slate-400 truncate"><span className="text-slate-500">وصف الأصدقاء:</span> <span className="text-slate-200">{answers.vibe_5}</span></div>}
          </div>
        </div>
      )}

      {/* ── Impressions ── */}
      {visibleImpressions.length > 0 && (
        <div>
          <SectionTitle icon={<MessageSquare size={11} />}>انطباعات المنظمين</SectionTitle>
          <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-0.5">
            {visibleImpressions.map((imp, i) => (
              <div key={i} className="bg-white/[0.04] rounded-lg p-2 border border-white/[0.06]">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-cyan-400 text-[10px] font-mono">#{imp.from_number}</span>
                    <span className="text-slate-300 text-[10px] font-medium truncate max-w-[90px]">{imp.from_name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-purple-400/70 text-[9px] font-mono">E{imp.event_id}</span>
                    <span className={`text-[9px] px-1 rounded ${imp.phase === 'phase2' ? 'bg-pink-500/15 text-pink-400/80' : 'bg-violet-500/15 text-violet-400/80'}`}>
                      {imp.phase === 'phase2' ? 'اختيار' : 'خوارزمية'}
                    </span>
                  </div>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">{imp.text}</p>
              </div>
            ))}
            {impressions.length > 6 && (
              <div className="text-center text-slate-600 text-[10px] pt-0.5">+{impressions.length - 6} more</div>
            )}
          </div>
        </div>
      )}

      {/* ── Previous Matches ── */}
      {visibleHistory.length > 0 && (
        <div>
          <SectionTitle icon={<Users size={11} />}>مطابقات سابقة</SectionTitle>
          <div className="space-y-0.5">
            {visibleHistory.map((m, idx) => (
              <div key={idx} className="flex items-center justify-between text-[11px] bg-white/[0.03] rounded px-2 py-1">
                <div className="flex items-center gap-1.5">
                  <ChevronLeft size={9} className="text-slate-600" />
                  <span className="text-cyan-400 font-mono">#{m.partner_number}</span>
                  <span className="text-slate-400 truncate max-w-[80px]">{m.partner_name}</span>
                </div>
                {m.event_id && m.event_id !== currentEventId && (
                  <span className="text-purple-400/70 text-[9px] font-mono">E{m.event_id}</span>
                )}
              </div>
            ))}
            {history.length > 5 && (
              <div className="text-center text-slate-600 text-[10px] pt-0.5">+{history.length - 5} more</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
