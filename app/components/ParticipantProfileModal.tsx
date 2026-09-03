import { useEffect, useMemo, useState } from "react"
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Edit2,
  Loader2,
  Phone,
  Save,
  Search,
  X,
  XCircle,
} from "lucide-react"
import { toast } from "react-hot-toast"
import { surveyQuestions } from "./SurveyComponent"

interface ParticipantProfileModalProps {
  participant: any
  isOpen: boolean
  onClose: () => void
  onUpdate: (participantNumber: number, updates: Record<string, any>) => void
  onSurveyHistoryChange?: () => void | Promise<void>
  cohostTheme?: boolean
}

type AnswerFilter = "all" | "answered" | "missing"

const CATEGORY_META: Record<string, { label: string; accent: string }> = {
  personal_info: { label: "المعلومات والتفضيلات الأساسية", accent: "text-blue-300" },
  match_update: { label: "أسئلة التوافق الجديدة", accent: "text-cyan-300" },
  profile_data_collection: { label: "الخلفية وأسلوب الحياة الاجتماعي", accent: "text-violet-300" },
  interaction_style: { label: "أسلوب التفاعل الأول", accent: "text-fuchsia-300" },
  attachment: { label: "العلاقة والقرب من الآخرين", accent: "text-pink-300" },
  communication: { label: "أسلوب التواصل", accent: "text-emerald-300" },
  lifestyle: { label: "نمط الحياة", accent: "text-orange-300" },
  core_values: { label: "القيم الأساسية", accent: "text-amber-300" },
  vibe: { label: "الاهتمامات والطاقة الشخصية", accent: "text-yellow-300" },
  interaction_synergy: { label: "التناغم في الحوار", accent: "text-indigo-300" },
  intent_goal: { label: "هدف المشاركة", accent: "text-teal-300" },
}

const CATEGORY_ORDER = [
  "personal_info",
  "match_update",
  "profile_data_collection",
  "interaction_style",
  "attachment",
  "communication",
  "lifestyle",
  "core_values",
  "vibe",
  "interaction_synergy",
  "intent_goal",
]

const questions = surveyQuestions as Array<any>

const hasAnswer = (value: any) => {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "boolean" || typeof value === "number") return true
  return String(value ?? "").trim().length > 0
}

const getParticipantValue = (participant: any, field: string) =>
  participant?.survey_data?.answers?.[field]
  ?? participant?.survey_data?.[field]
  ?? participant?.[field]
  ?? ""

const getGenderPreference = (participant: any) => {
  const raw = getParticipantValue(participant, "gender_preference")
  if (raw === "male" || raw === "female" || raw === "any") return raw

  const gender = getParticipantValue(participant, "gender")
  if (raw === "same_gender") return gender || ""
  if (raw === "opposite_gender") return gender === "male" ? "female" : gender === "female" ? "male" : ""
  if (raw === "any_gender" || participant?.any_gender_preference) return "any"
  if (participant?.same_gender_preference) return gender || ""
  return gender === "male" ? "female" : gender === "female" ? "male" : ""
}

const buildParticipantData = (participant: any) => {
  const surveyData = participant?.survey_data || {}
  const answers = surveyData.answers || {}
  const merged = { ...surveyData, ...participant, ...answers }

  return {
    ...merged,
    name: getParticipantValue(participant, "name"),
    phone_number: getParticipantValue(participant, "phone_number"),
    age: getParticipantValue(participant, "age"),
    gender: getParticipantValue(participant, "gender"),
    nationality: getParticipantValue(participant, "nationality"),
    nationality_preference: getParticipantValue(participant, "nationality_preference")
      || (participant?.prefer_same_nationality === true ? "same" : participant?.prefer_same_nationality === false ? "any" : ""),
    gender_preference: getGenderPreference(participant),
    age_flex_one_year: getParticipantValue(participant, "age_flex_one_year") === true
      ? "accept"
      : getParticipantValue(participant, "age_flex_one_year") === false
        ? "decline"
        : getParticipantValue(participant, "age_flex_one_year"),
  }
}

const isQuestionAnswered = (question: any, data: any) => {
  if (question.id === "preferred_age_range") {
    const isOpen = data.open_age_preference === true || data.open_age_preference === "true"
    return isOpen || (hasAnswer(data.preferred_age_min) && hasAnswer(data.preferred_age_max))
  }
  return hasAnswer(data[question.id])
}

const optionLabel = (question: any, value: any) => {
  const option = question.options?.find((candidate: any) => String(candidate.value) === String(value))
  return option?.label || String(value ?? "")
}

export default function ParticipantProfileModal({
  participant,
  isOpen,
  onClose,
  onUpdate,
  onSurveyHistoryChange,
  cohostTheme = false,
}: ParticipantProfileModalProps) {
  const [editMode, setEditMode] = useState<Record<string, boolean>>({})
  const [editedData, setEditedData] = useState<any>({})
  const [originalData, setOriginalData] = useState<any>({})
  const [savingField, setSavingField] = useState<string | null>(null)
  const [messageSent, setMessageSent] = useState(false)
  const [markingSent, setMarkingSent] = useState(false)
  const [questionSearch, setQuestionSearch] = useState("")
  const [answerFilter, setAnswerFilter] = useState<AnswerFilter>("all")

  useEffect(() => {
    if (!participant || !isOpen) return
    const initialData = buildParticipantData(participant)
    setEditedData(initialData)
    setOriginalData(initialData)
    setEditMode({})
    setQuestionSearch("")
    setAnswerFilter("all")
    setMessageSent(!!participant.PAID)
  }, [participant, isOpen])

  const completion = useMemo(() => {
    const answered = questions.filter(question => isQuestionAnswered(question, editedData)).length
    return {
      answered,
      total: questions.length,
      percentage: questions.length ? Math.round((answered / questions.length) * 100) : 0,
    }
  }, [editedData])

  const visibleSections = useMemo(() => {
    const normalizedSearch = questionSearch.trim().toLocaleLowerCase()
    const allByCategory = new Map<string, Array<any>>()
    const visibleByCategory = new Map<string, Array<any>>()
    const answeredByCategory = new Map<string, number>()

    for (const question of questions) {
      const categoryQuestions = allByCategory.get(question.category) || []
      categoryQuestions.push(question)
      allByCategory.set(question.category, categoryQuestions)

      const answered = isQuestionAnswered(question, editedData)
      if (answered) answeredByCategory.set(question.category, (answeredByCategory.get(question.category) || 0) + 1)
      const matchesAnswer = answerFilter === "all" || (answerFilter === "answered" ? answered : !answered)
      const searchable = `${question.question || ""} ${question.description || ""} ${question.id || ""}`.toLocaleLowerCase()
      if (matchesAnswer && (!normalizedSearch || searchable.includes(normalizedSearch))) {
        const categoryVisible = visibleByCategory.get(question.category) || []
        categoryVisible.push(question)
        visibleByCategory.set(question.category, categoryVisible)
      }
    }

    return CATEGORY_ORDER.map(category => ({
      category,
      questions: visibleByCategory.get(category) || [],
      answered: answeredByCategory.get(category) || 0,
      total: allByCategory.get(category)?.length || 0,
    })).filter(section => section.questions.length > 0)
  }, [answerFilter, editedData, questionSearch])

  if (!isOpen || !participant) return null

  const handleWhatsAppClick = async () => {
    const phone = String(participant.phone_number || editedData.phone_number || "").replace(/\D/g, "")
    if (phone) window.open(`https://wa.me/${phone}`, "_blank")
    if (messageSent) return

    setMarkingSent(true)
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle-message-status",
          participantNumber: participant.assigned_number,
          newStatus: true,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        setMessageSent(true)
        toast.success("Marked as messaged")
        onUpdate(participant.assigned_number, data.updates || { PAID: true })
      }
    } catch (error) {
      console.error("Error marking as sent:", error)
    } finally {
      setMarkingSent(false)
    }
  }

  const setValue = (field: string, value: any) => {
    setEditedData((current: any) => ({ ...current, [field]: value }))
  }

  const persistField = async (field: string, value: any) => {
    const response = await fetch("/api/admin/update-participant-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantNumber: participant.assigned_number,
        field,
        value,
      }),
    })
    const data = await response.json()
    if (!response.ok || !data.success) throw new Error(data.error || "Failed to update")
    onUpdate(participant.assigned_number, data.updates || { [field]: data.value })
    return data
  }

  const saveQuestion = async (question: any) => {
    const editKey = question.id
    setSavingField(editKey)
    try {
      if (question.type === "age_range") {
        const fields = ["open_age_preference", "preferred_age_min", "preferred_age_max", "age_flex_one_year"]
          .filter(field => JSON.stringify(editedData[field]) !== JSON.stringify(originalData[field]))
        const nextMinimum = Number(editedData.preferred_age_min)
        const oldMaximum = Number(originalData.preferred_age_max)
        if (fields.includes("preferred_age_min") && fields.includes("preferred_age_max") && nextMinimum > oldMaximum) {
          fields.splice(fields.indexOf("preferred_age_max"), 1)
          fields.unshift("preferred_age_max")
        }
        for (const field of fields) await persistField(field, editedData[field])
        setOriginalData((current: any) => ({
          ...current,
          ...Object.fromEntries(fields.map(field => [field, editedData[field]])),
        }))
      } else {
        await persistField(question.id, editedData[question.id])
        setOriginalData((current: any) => ({ ...current, [question.id]: editedData[question.id] }))
      }
      setEditMode(current => ({ ...current, [editKey]: false }))
      toast.success("Survey answer updated")
      await onSurveyHistoryChange?.()
    } catch (error: any) {
      toast.error(error?.message || "Failed to update answer")
    } finally {
      setSavingField(null)
    }
  }

  const cancelQuestion = (question: any) => {
    const fields = question.type === "age_range"
      ? ["open_age_preference", "preferred_age_min", "preferred_age_max", "age_flex_one_year"]
      : [question.id]
    setEditedData((current: any) => ({
      ...current,
      ...Object.fromEntries(fields.map(field => [field, originalData[field] ?? ""])),
    }))
    setEditMode(current => ({ ...current, [question.id]: false }))
  }

  const renderDisplayValue = (question: any) => {
    if (question.type === "age_range") {
      const isOpen = editedData.open_age_preference === true || editedData.open_age_preference === "true"
      if (isOpen) return "مفتوح — بدون قيود عمرية"
      if (!hasAnswer(editedData.preferred_age_min) && !hasAnswer(editedData.preferred_age_max)) return null
      return `${editedData.preferred_age_min || "—"} – ${editedData.preferred_age_max || "—"} سنة`
    }
    const value = editedData[question.id]
    if (!hasAnswer(value)) return null
    if (Array.isArray(value)) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {value.map(item => (
            <span key={String(item)} className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100">
              {optionLabel(question, item)}
            </span>
          ))}
        </div>
      )
    }
    return optionLabel(question, value)
  }

  const renderEditor = (question: any) => {
    if (question.type === "age_range") {
      const isOpen = editedData.open_age_preference === true || editedData.open_age_preference === "true"
      return (
        <div className="space-y-3" dir="rtl">
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
            <span>بدون قيود عمرية</span>
            <input
              type="checkbox"
              checked={isOpen}
              onChange={event => setValue("open_age_preference", event.target.checked)}
              className="h-4 w-4 accent-violet-500"
            />
          </label>
          <div className="grid grid-cols-2 gap-2" dir="ltr">
            <input
              type="number"
              min={18}
              max={65}
              disabled={isOpen}
              value={editedData.preferred_age_min ?? ""}
              onChange={event => setValue("preferred_age_min", event.target.value)}
              placeholder="Min age"
              className="rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-white disabled:opacity-40"
            />
            <input
              type="number"
              min={18}
              max={65}
              disabled={isOpen}
              value={editedData.preferred_age_max ?? ""}
              onChange={event => setValue("preferred_age_max", event.target.value)}
              placeholder="Max age"
              className="rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-white disabled:opacity-40"
            />
          </div>
          <select
            value={editedData.age_flex_one_year ?? ""}
            onChange={event => setValue("age_flex_one_year", event.target.value)}
            className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white"
          >
            <option value="">مرونة سنة واحدة — غير محدد</option>
            <option value="accept">نعم، أقبل التوسيع سنة</option>
            <option value="decline">لا، التزموا بالمدى</option>
            <option value="not_applicable">غير منطبق</option>
          </select>
        </div>
      )
    }

    if (question.type === "radio" || question.type === "select") {
      return (
        <select
          value={editedData[question.id] ?? ""}
          onChange={event => setValue(question.id, event.target.value)}
          className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-sm text-white"
          dir="rtl"
        >
          <option value="">غير محدد</option>
          {(question.options || []).map((option: any) => (
            <option key={String(option.value)} value={option.value}>{option.label}</option>
          ))}
        </select>
      )
    }

    if (question.type === "checkbox") {
      const selected = Array.isArray(editedData[question.id]) ? editedData[question.id] : []
      const maxSelections = question.maxSelections || question.options?.length || 1
      return (
        <div className="grid gap-2 sm:grid-cols-2" dir="rtl">
          {(question.options || []).map((option: any) => {
            const checked = selected.includes(option.value)
            const disabled = !checked && selected.length >= maxSelections
            return (
              <label key={String(option.value)} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5 ${checked ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300"} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => setValue(question.id, checked
                    ? selected.filter((item: string) => item !== option.value)
                    : [...selected, option.value])}
                  className="mt-1 accent-cyan-500"
                />
                {option.label}
              </label>
            )
          })}
          <p className="text-[11px] text-slate-500 sm:col-span-2">{selected.length}/{maxSelections} selected</p>
        </div>
      )
    }

    const useTextArea = question.maxLength >= 80 || ["match_current_curiosity", "vibe_2", "vibe_3", "vibe_5"].includes(question.id)
    if (useTextArea) {
      return (
        <div>
          <textarea
            value={editedData[question.id] ?? ""}
            onChange={event => setValue(question.id, event.target.value)}
            maxLength={question.maxLength}
            className="min-h-24 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white"
            dir="auto"
          />
          {question.maxLength && <p className="mt-1 text-right text-[10px] text-slate-500">{String(editedData[question.id] || "").length}/{question.maxLength}</p>}
        </div>
      )
    }

    return (
      <input
        type={question.type === "number" ? "number" : "text"}
        min={question.min}
        max={question.max}
        maxLength={question.maxLength}
        value={editedData[question.id] ?? ""}
        onChange={event => setValue(question.id, event.target.value)}
        className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white"
        dir="auto"
      />
    )
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-2 backdrop-blur-sm sm:p-4 ${cohostTheme ? "bg-rose-950/70" : "bg-black/75"}`} onClick={onClose}>
      <div className={`flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden border shadow-2xl ${cohostTheme ? "rounded-3xl border-rose-400/30 bg-gradient-to-br from-rose-950 via-slate-950 to-rose-950" : "rounded-2xl border-white/15 bg-slate-950"}`} onClick={event => event.stopPropagation()}>
        <header className="border-b border-white/10 bg-gradient-to-r from-blue-600/15 via-violet-600/10 to-cyan-600/15 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black text-white sm:text-2xl">#{participant.assigned_number} · {editedData.name || "No name"}</h2>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${messageSent ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300" : "border-rose-400/30 bg-rose-500/15 text-rose-300"}`}>
                  {messageSent ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {messageSent ? "Messaged" : "Not Messaged"}
                </span>
              </div>
              <div className="mt-3 flex max-w-2xl items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all" style={{ width: `${completion.percentage}%` }} />
                </div>
                <span className="whitespace-nowrap text-xs font-bold text-cyan-200">{completion.percentage}% · {completion.answered}/{completion.total}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={handleWhatsAppClick} disabled={markingSent} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50">
                {markingSent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                <span className="hidden sm:inline">WhatsApp</span>
              </button>
              <button onClick={onClose} className="rounded-xl p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Close profile"><X className="h-5 w-5" /></button>
            </div>
          </div>
        </header>

        <div className="border-b border-white/10 bg-slate-900/80 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={questionSearch} onChange={event => setQuestionSearch(event.target.value)} placeholder="Search every survey question…" className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500" />
            </label>
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
              {(["all", "answered", "missing"] as AnswerFilter[]).map(filter => (
                <button key={filter} onClick={() => setAnswerFilter(filter)} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize sm:flex-none ${answerFilter === filter ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400 hover:text-white"}`}>{filter}</button>
              ))}
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          {visibleSections.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center text-center text-slate-500"><Search className="mb-3 h-7 w-7" /><p>No survey questions match this view.</p></div>
          ) : (
            <div className="space-y-5">
              {visibleSections.map(section => {
                const meta = CATEGORY_META[section.category] || { label: section.category, accent: "text-slate-300" }
                return (
                  <details key={section.category} open className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-b border-white/10 bg-white/[0.035] px-4 py-3">
                      <div>
                        <h3 className={`font-black ${meta.accent}`}>{meta.label}</h3>
                        <p className="mt-0.5 text-[11px] text-slate-500">{section.answered}/{section.total} answered</p>
                      </div>
                      <ChevronDown className="h-5 w-5 text-slate-500 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="grid gap-3 p-3 lg:grid-cols-2 sm:p-4">
                      {section.questions.map(question => {
                        const editing = !!editMode[question.id]
                        const answered = isQuestionAnswered(question, editedData)
                        const displayValue = renderDisplayValue(question)
                        return (
                          <article key={question.id} className={`rounded-2xl border p-4 transition ${editing ? "border-cyan-400/40 bg-cyan-500/[0.06] lg:col-span-2" : answered ? "border-white/10 bg-slate-900/60" : "border-dashed border-amber-400/25 bg-amber-500/[0.035]"}`} dir="rtl" style={{ contentVisibility: "auto", containIntrinsicSize: "0 210px" }}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-500">{question.question}</span>
                                  {question.isNew && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-black text-slate-950">جديد</span>}
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${answered ? "text-emerald-400" : "text-amber-300"}`}>
                                    {answered ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                    {answered ? "تمت الإجابة" : "بدون إجابة"}
                                  </span>
                                </div>
                                <h4 className="text-sm font-bold leading-6 text-slate-100 sm:text-[15px]">{question.description || question.question}</h4>
                                {question.supportingText && <p className="mt-1 text-xs leading-5 text-slate-500">{question.supportingText}</p>}
                              </div>
                              {!editing ? (
                                <button onClick={() => setEditMode(current => ({ ...current, [question.id]: true }))} className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200" title="Edit answer"><Edit2 className="h-4 w-4" /></button>
                              ) : (
                                <div className="flex shrink-0 gap-1">
                                  <button onClick={() => saveQuestion(question)} disabled={savingField !== null} className="rounded-lg border border-emerald-400/25 bg-emerald-500/15 p-2 text-emerald-300 disabled:opacity-50" title="Save answer">{savingField === question.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</button>
                                  <button onClick={() => cancelQuestion(question)} disabled={savingField !== null} className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-2 text-rose-300 disabled:opacity-50" title="Cancel"><X className="h-4 w-4" /></button>
                                </div>
                              )}
                            </div>
                            <div className="mt-3 border-t border-white/5 pt-3 text-sm leading-6 text-white" dir="auto">
                              {editing ? renderEditor(question) : displayValue ?? <span className="italic text-slate-600">Not provided</span>}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </details>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
