import React, { useMemo } from "react"
import { MessageSquare, Users, Sparkles, ChevronLeft, CalendarCheck, User, CheckCircle, Info } from "lucide-react"
import { surveyQuestions } from "~/components/SurveyComponent"

const surveyOptionMap = new Map<string, Map<string, string>>()
for (const q of surveyQuestions) {
  if (q.options) {
    const m = new Map<string, string>()
    for (const opt of q.options) {
      m.set(opt.value, opt.label.replace(/^[\u0623-\u062F]\.[\s\u00A0]*/, ""))
    }
    surveyOptionMap.set(q.id, m)
  }
}

function mapEnumLabel(fieldId: string, rawValue: any): string {
  if (rawValue == null) return "غير محدد"
  const m = surveyOptionMap.get(fieldId)
  if (m) {
    const label = m.get(String(rawValue))
    if (label) return label
  }
  return String(rawValue)
}

const categoryLabels: Record<string, string> = {
  personal_info: "الملف الشخصي",
  match_update: "تحديث المطابقة",
  interaction_style: "أسلوب التفاعل",
  profile_data_collection: "معلومات إضافية",
  attachment: "أسلوب التعلق",
  lifestyle: "النمط الحياتي",
  core_values: "القيم الأساسية",
  communication: "التواصل",
  vibe: "الشخصية والطاقة",
  interaction_synergy: "التفاعل المتبادل",
  intent_goal: "الهدف",
}

const excludedForProfile = new Set([
  "phone_number",
  "phone_cc",
  "phone_local",
  "name",
  "phone",
  "created_at",
  "updated_at",
  "survey_data",
  "id",
  "signup_event_id",
  "signup_for_next_event",
  "next_event_signup_timestamp",
  "auto_signup_next_event",
  "payment_waived",
  "payment_status",
  "attendance_confirmed",
  "attendance_denied_at",
  "arrival_status",
  "PAID",
  "PAID_DONE",
  "assigned_number",
  "any_gender_preference",
  "same_gender_preference",
])

function formatAnswer(fieldId: string, rawValue: unknown): string {
  if (rawValue == null) return "غير محدد"
  if (Array.isArray(rawValue)) {
    if (rawValue.length === 0) return "غير محدد"
    return rawValue.map(v => formatAnswer(fieldId, v)).join("، ")
  }
  if (typeof rawValue === "boolean") return rawValue ? "نعم" : "لا"
  if (typeof rawValue === "string" && rawValue.trim() === "") return "غير محدد"
  if (fieldId === "open_intent_goal_mismatch") {
    return rawValue === true || String(rawValue) === "true" ? "نعم" : "لا"
  }
  return mapEnumLabel(fieldId, rawValue)
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

  const groupedAnswers = useMemo(() => {
    const groups: Array<{ category: string; entries: Array<{ label: string; value: string; raw: unknown }> }> = []
    const add = (categoryKey: string, questionId: string) => {
      const category = categoryLabels[categoryKey] || "معلومات أخرى"
      let bucket = groups.find((g) => g.category === category)
      if (!bucket) {
        bucket = { category, entries: [] }
        groups.push(bucket)
      }
      const question = surveyQuestions.find((q) => q.id === questionId)
      const value = question?.id && (answers[question.id] ?? pData?.[question.id])
      bucket.entries.push({
        label: question?.description || question?.question || questionId,
        value: formatAnswer(questionId, value),
        raw: value,
      })
    }

    for (const q of surveyQuestions) {
      if (excludedForProfile.has(q.id)) continue
      if (q.id in answers || q.id in pData) {
        add(q.category || "معلومات أخرى", q.id)
      }
    }

    return groups
  }, [answers, pData])

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

    const intentGoalRaw = answers.intent_goal || pData?.intent_goal
    const intentGoal = intentGoalRaw ? mapEnumLabel("intent_goal", intentGoalRaw) : "غير محدد"
    const openIntentMismatch = answers.open_intent_goal_mismatch === true || answers.open_intent_goal_mismatch === "true" || pData?.open_intent_goal_mismatch === true

    const vibes = [
      answers.vibe_1, answers.vibe_2, answers.vibe_3,
      answers.vibe_4, answers.vibe_5, answers.vibe_6,
    ].filter(Boolean)

    const signupEventId = Number(pData?.signup_event_id || 0)
    const hasCurrentSignup = !!pData?.next_event_signup_timestamp && (
      pData?.auto_signup_next_event === true
      || (pData?.signup_for_next_event === true && (!signupEventId || signupEventId === Number(currentEventId)))
    )

    return {
      age: answers.age || surveyData.age || pData?.age || "غير محدد",
      mbti: pData?.mbti_personality_type || answers.mbti || "غير محدد",
      genderPref,
      agePref,
      nationality,
      natPref,
      intentGoal,
      openIntentMismatch,
      vibes,
      signupAgo: hasCurrentSignup ? timeAgo(pData.next_event_signup_timestamp) : null,
    }
  }, [answers, pData, currentEventId])

  const visibleHistory = useMemo(() => history.slice(0, 5), [history])
  const visibleImpressions = useMemo(() => impressions.slice(0, 6), [impressions])
  const eventCount = useMemo(() => {
    const ids = new Set<number>()
    for (const h of history) {
      if (h.event_id) ids.add(h.event_id)
    }
    return ids.size
  }, [history])

  return (
    <div className="w-[min(96vw,640px)] space-y-3" dir="rtl">
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="inline-flex rounded-full border border-cyan-400/40 bg-cyan-500/15 p-1.5">
            <User size={13} className="text-cyan-300" />
          </span>
          <span className="text-white font-bold text-base">{participantName || "غير محدد"}</span>
          <span className="text-slate-500 text-xs font-mono">#{participantNumber}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          {eventCount > 0 && (
            <span className="flex items-center gap-0.5 text-cyan-400/70"><CalendarCheck size={9} />{eventCount} فعالية</span>
          )}
          {computed.signupAgo && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
              <CalendarCheck size={9} />مسجل {computed.signupAgo}
            </span>
          )}
        </div>
      </div>

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

      {computed.vibes.length > 0 && (
        <div>
          <SectionTitle icon={<Sparkles size={11} />}>الطاقة والشخصية</SectionTitle>
          <div className="space-y-1">
            {answers.vibe_1 && <div className="text-[11px] text-slate-400"><span className="text-slate-500">الهواية:</span> <span className="text-slate-200">{answers.vibe_1}</span></div>}
            {answers.vibe_2 && <div className="text-[11px] text-slate-400"><span className="text-slate-500">الموسيقى:</span> <span className="text-slate-200">{answers.vibe_2}</span></div>}
            {answers.vibe_5 && <div className="text-[11px] text-slate-400"><span className="text-slate-500">وصف الأصدقاء:</span> <span className="text-slate-200">{answers.vibe_5}</span></div>}
          </div>
        </div>
      )}

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

      <div>
        <SectionTitle icon={<CheckCircle size={11} />}>تفاصيل الاستبيان</SectionTitle>
        {groupedAnswers.length === 0 ? (
          <div className="text-xs text-slate-400">لا توجد إجابات إضافية لعرضها</div>
        ) : (
          <div className="space-y-2.5">
            {groupedAnswers.map(group => (
              <div key={group.category}>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-cyan-300/80">{group.category}</div>
                <div className="space-y-1.5 rounded-lg border border-white/5 bg-white/[0.03] p-2">
                  {group.entries.map((entry) => (
                    <div key={entry.label + entry.value} className="text-[11px] leading-relaxed">
                      <div className="text-slate-400 mb-0.5">{entry.label}</div>
                      <div className="text-slate-200">{entry.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-500 flex items-center gap-1">
        <Info size={11} className="text-slate-500" />
        تم تصنيف إجابات الاستبيان تلقائياً، وتعرض هنا بالكامل فقط للقراءة الداخلية.
      </p>
    </div>
  )
}
