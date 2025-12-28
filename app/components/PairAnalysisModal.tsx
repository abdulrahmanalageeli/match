import React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { BadgeCheck, Brain, Info, Shield, Sparkles, Zap } from "lucide-react"
import CircularProgressBar from "./CircularProgressBar"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs"

interface PairAnalysisModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  a?: any // full participant row (with survey_data)
  b?: any // full participant row (with survey_data)
  pair?: {
    compatibility_score: number
    synergy_score?: number
    lifestyle_compatibility_score?: number
    humor_open_score?: number
    communication_compatibility_score?: number
    intent_score?: number
    vibe_compatibility_score?: number
    // gates & bonuses
    humor_early_openness_bonus?: 'full' | 'partial' | 'none'
    intent_boost_applied?: boolean
    attachment_penalty_applied?: boolean
    dead_air_veto_applied?: boolean
    humor_clash_veto_applied?: boolean
    cap_applied?: number | null
    reason?: string
  } | null
}

// Minimal question text mapping for sections we visualize
const LIFESTYLE_QUESTIONS: Record<number, string> = {
  1: "في أي وقت من اليوم تكون عادة في أفضل حالتك؟",
  2: "كم تفضل أن تتواصل مع صديقك المقرّب؟",
  3: "كم تهمك المساحة الشخصية في علاقات الصداقة؟",
  4: "كيف تفضل أن تدير وقتك عادة؟",
  5: "كيف تحب تقضي نهاية الأسبوع غالبًا؟",
}

const SYNERGY_QUESTIONS: Record<string, string> = {
  conversational_role: "في أي جلسة أو جمعة، وش يكون دورك العفوي؟",
  conversation_depth_pref: "وش نوع السوالف اللي تشدك وتخليك تسترسل؟",
  social_battery: "بعد ساعة من السوالف مع ناس جدد، كيف تحس طاقتك؟",
  humor_subtype: "وش أكثر شيء يضحكك من قلب؟",
  curiosity_style: "وش اللي يمتعك أكثر وأنت تتعرف على شخص جديد؟",
  silence_comfort: "لو صار فيه هدوء مفاجئ في الجلسة، وش يكون شعورك؟",
}

const VALUE_LABELS: Record<string, string> = {
  A: 'أ',
  B: 'ب',
  C: 'ج',
  D: 'د',
}

// Additional question maps with option labels for richer comparison
const MBTI_QUESTIONS: Record<string, { label: string, options: Record<string, string> }> = {
  mbti_1: {
    label: "عندما تتم دعوتك إلى مناسبة اجتماعية كبيرة، هل:",
    options: {
      'أ': "تشعر بالحماس للتعرّف على أشخاص جدد وتبقى حتى آخر الحفل",
      'ب': "تغادر مبكرًا لوقت هادئ بعد فترة وجيزة",
    }
  },
  mbti_2: {
    label: "عندما تواجه مشكلة جديدة أو تحديًا غير مألوف، كيف تتعامل معه غالبًا؟",
    options: {
      'أ': "أطبّق حلولًا مجرّبة وواضحة",
      'ب': "أتبع حدسي وأستكشف حلولًا جديدة",
    }
  },
  mbti_3: {
    label: "عند اتخاذ قرار يؤثر على الآخرين، تميل إلى:",
    options: {
      'أ': "إعطاء الأولوية للمنطق",
      'ب': "مراعاة مشاعر الآخرين",
    }
  },
  mbti_4: {
    label: "إذا تغيّرت خطتك فجأة، كيف تشعر؟",
    options: {
      'أ': "توتر وتفضيل الالتزام بالخطة",
      'ب': "تأقلم بسهولة وفرصة لتجربة جديدة",
    }
  },
}

const ATTACHMENT_QUESTIONS: Record<string, { label: string, options: Record<string, string> }> = {
  attachment_1: { label: "إذا لم يتواصل صديقك لأيام:",
    options: { 'أ': 'أتفهم ولا أقلق', 'ب': 'أظن أنني أخطأت', 'ج': 'لا أحب الاعتماد كثيرًا', 'د': 'توتر وتذبذب' } },
  attachment_2: { label: "عند حدوث خلاف:",
    options: { 'أ': 'أواجه بهدوء', 'ب': 'أتجنب المواجهة', 'ج': 'أنسحب', 'د': 'أقترب ثم أبتعد' } },
  attachment_3: { label: "القرب العاطفي:",
    options: { 'أ': 'مرتاح وأعبر', 'ب': 'أحتاج طمأنة', 'ج': 'لا أرتاح', 'د': 'أخاف الرفض' } },
  attachment_4: { label: "في الأوقات الصعبة:",
    options: { 'أ': 'أشارك وأثق بدعمهم', 'ب': 'أحتاجهم بشدة', 'ج': 'أحل وحدي', 'د': 'أطلب ثم أنسحب' } },
  attachment_5: { label: "العلاقات طويلة المدى:",
    options: { 'أ': 'أراها صحية', 'ب': 'مهمة لكن أخاف', 'ج': 'أفضل الخفيفة', 'د': 'أرتبك وأتجنب' } },
}

const COMMUNICATION_QUESTIONS: Record<string, { label: string, options: Record<string, string> }> = {
  communication_1: { label: "إذا تخطى أحد حدودك:",
    options: { 'أ': 'أواجه بلطف وصراحة', 'ب': 'أكتم المشاعر', 'ج': 'أهاجم مباشرة', 'د': 'تلميحات غير مباشرة' } },
  communication_2: { label: "عند طلب شيء:",
    options: { 'أ': 'أطلب بوضوح', 'ب': 'أتمنى أن يلاحظ', 'ج': 'بإلحاح/ضغط', 'د': 'أقول لا مشكلة وأتضايق' } },
  communication_3: { label: "عند اختلاف رأي:",
    options: { 'أ': 'أوضح بهدوء', 'ب': 'أوافق ظاهريًا', 'ج': 'أهاجم الرأي', 'د': 'صمت وتلميحات لاحقًا' } },
  communication_4: { label: "عند التوتر:",
    options: { 'أ': 'أشارك بصراحة باحترام', 'ب': 'أكتم وأتجنب', 'ج': 'أنفجر', 'د': 'أبدو بخير وأعاقب بالصمت' } },
  communication_5: { label: "عند عدم الموافقة:",
    options: { 'أ': 'أشرح باحترام', 'ب': 'أفضل السكوت', 'ج': 'أصرّ وأقلل', 'د': 'سخرية/تلميحات' } },
}

const CORE_VALUES_QUESTIONS: Record<string, { label: string, options: Record<string, string> }> = {
  core_values_1: { label: "الصدق أم العلاقة؟",
    options: { 'أ': 'أخبر الحقيقة', 'ب': 'أغيّر الموضوع', 'ج': 'أغطي على صديقي' } },
  core_values_2: { label: "الطموح أم الاستقرار؟",
    options: { 'أ': 'أشجع تمامًا', 'ب': 'أتريث قليلاً', 'ج': 'ترك الاستقرار مخاطرة' } },
  core_values_3: { label: "التقبل أم التشابه؟",
    options: { 'أ': 'الاختلاف لا يهم', 'ب': 'ربما يرهقني لاحقًا', 'ج': 'أفضل التشابه' } },
  core_values_4: { label: "الاعتماد أم الاستقلال؟",
    options: { 'أ': 'أفضل الخصوصية', 'ب': 'كنت أتمنى تواصلًا أكثر', 'ج': 'شعور بالإهمال' } },
  core_values_5: { label: "الواجب أم الحرية؟",
    options: { 'أ': 'لكل شخص حكمه', 'ب': 'أقلل تواصل احترامًا', 'ج': 'أقف معه' } },
}

function ScoreBar({ label, value, max, color }: { label: string, value: number, max: number, color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-100 font-semibold">{value.toFixed(1)} / {max}</span>
      </div>
      <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function PairAnalysisModal({ open, onOpenChange, a, b, pair }: PairAnalysisModalProps) {
  // Safely parse survey_data when it's a JSON string
  const parseJSON = (s: any) => {
    try { return typeof s === 'string' ? JSON.parse(s) : (s || {}) } catch { return {} }
  }
  const aSurvey = parseJSON(a?.survey_data)
  const bSurvey = parseJSON(b?.survey_data)
  const aAns = aSurvey?.answers || {}
  const bAns = bSurvey?.answers || {}

  // Normalize scores (support 0..1 or absolute values)
  const normalize = (val: number | undefined, max: number): number => {
    if (typeof val !== 'number' || isNaN(val)) return 0
    return val <= 1 ? val * max : val
  }

  // Compute Humor & Early Openness breakdown (mirror backend logic)
  const computeHumorOpenBreakdown = (pa: any, pb: any) => {
    const getAns = (p: any, key: string) => p?.survey_data?.answers?.[key] ?? p?.survey_data?.[key] ?? p?.[key] ?? undefined
    const rawHumorA = getAns(pa, 'humor_banter_style')
    const rawHumorB = getAns(pb, 'humor_banter_style')
    const hA = rawHumorA ? String(rawHumorA).toUpperCase() : ''
    const hB = rawHumorB ? String(rawHumorB).toUpperCase() : ''
    const rawOpenA = getAns(pa, 'early_openness_comfort')
    const rawOpenB = getAns(pb, 'early_openness_comfort')
    const oA = rawOpenA !== undefined && rawOpenA !== null ? parseInt(rawOpenA) : undefined
    const oB = rawOpenB !== undefined && rawOpenB !== null ? parseInt(rawOpenB) : undefined

    let humorScore = 0
    let vetoClash = false
    if (hA && hB) {
      if (hA === hB) humorScore = 10
      else if ((hA === 'A' && hB === 'B') || (hA === 'B' && hB === 'A')) humorScore = 8
      else if ((hA === 'B' && hB === 'C') || (hA === 'C' && hB === 'B') || (hA === 'C' && hB === 'D') || (hA === 'D' && hB === 'C')) humorScore = 5
      else if ((hA === 'A' && hB === 'D') || (hA === 'D' && hB === 'A')) { humorScore = 0; vetoClash = true }
      else humorScore = 5
    }

    let openScore = 0
    if (oA !== undefined && oB !== undefined) {
      const dist = Math.abs(oA - oB)
      if (dist === 0) openScore = 5
      else if (dist === 1) openScore = 3
      else if (dist === 2) openScore = 1
      else openScore = 0
    }

    return { hA, hB, oA, oB, humorScore, openScore, total: humorScore + openScore, vetoClash }
  }

  // Compute Intent score (mirror backend mapping, 0..5)
  const computeIntentScore = (pa: any, pb: any) => {
    const getAns = (p: any, key: string) => p?.survey_data?.answers?.[key] ?? p?.[key] ?? ''
    const a40 = String(getAns(pa, 'intent_goal') || '').toUpperCase()
    const b40 = String(getAns(pb, 'intent_goal') || '').toUpperCase()
    let score = 0
    if (!a40 || !b40) score = 0
    else if ((a40 === 'A' && b40 === 'A') || (a40 === 'B' && b40 === 'B')) score = 5
    else if (a40 === 'C' && b40 === 'C') score = 3
    else if ((a40 === 'A' && b40 === 'B') || (a40 === 'B' && b40 === 'A')) score = 1
    else if ((a40 === 'A' && b40 === 'C') || (a40 === 'C' && b40 === 'A')) score = 3
    else if ((a40 === 'B' && b40 === 'C') || (a40 === 'C' && b40 === 'B')) score = 1
    return { a40, b40, score }
  }

  // Derive lifestyle list from row, survey_data, or answers
  const deriveLifestyleList = (p: any, survey: any, ans: any): string[] => {
    const fromRow = typeof p?.lifestylePreferences === 'string' ? p.lifestylePreferences : undefined
    const fromSurvey = typeof survey?.lifestylePreferences === 'string' ? survey.lifestylePreferences : undefined
    const raw = fromRow || fromSurvey
    if (raw && raw.includes(',')) return raw.split(',').map((s: string) => s.trim())
    const list = [ans.lifestyle_1, ans.lifestyle_2, ans.lifestyle_3, ans.lifestyle_4, ans.lifestyle_5].filter(Boolean)
    return list as string[]
  }

  const lifestyleA = deriveLifestyleList(a, aSurvey, aAns)
  const lifestyleB = deriveLifestyleList(b, bSurvey, bAns)

  // Helpers to format preferences
  const mapGenderPref = (p: any): string => {
    const ans = p?.survey_data?.answers || {}
    const raw = ans.actual_gender_preference || ans.gender_preference
    if (raw === 'any_gender' || p?.any_gender_preference) return 'أي جنس'
    if (raw === 'same_gender' || p?.same_gender_preference) return 'نفس الجنس فقط'
    if (raw === 'opposite_gender') return 'الجنس المقابل'
    // default when nothing explicit
    if (p?.any_gender_preference) return 'أي جنس'
    if (p?.same_gender_preference) return 'نفس الجنس فقط'
    return 'الجنس المقابل'
  }

  const mapAgePref = (p: any): string => {
    const ans = p?.survey_data?.answers || {}
    const open = ans.open_age_preference === 'true' || ans.open_age_preference === true || p?.open_age_preference
    if (open) return 'مفتوح: بدون قيود عمرية'
    const min = ans.preferred_age_min ?? p?.preferred_age_min
    const max = ans.preferred_age_max ?? p?.preferred_age_max
    if (min && max) return `من ${min} إلى ${max}`
    if (min) return `من ${min}+`
    if (max) return `حتى ${max}`
    return 'غير محدد'
  }

  const mapNationality = (p: any): string => {
    const ans = p?.survey_data?.answers || {}
    return p?.nationality || ans.nationality || 'غير محدد'
  }

  const mapNationalityPref = (p: any): string => {
    const ans = p?.survey_data?.answers || {}
    const pref = ans.nationality_preference
    if (pref === 'same') return 'نفس الجنسية'
    if (pref === 'any') return 'أي جنسية'
    if (typeof p?.prefer_same_nationality === 'boolean') {
      return p.prefer_same_nationality ? 'نفس الجنسية' : 'أي جنسية'
    }
    return 'غير محدد'
  }

  const aGenderPref = mapGenderPref(a)
  const bGenderPref = mapGenderPref(b)
  const aAgePref = mapAgePref(a)
  const bAgePref = mapAgePref(b)
  const aNationality = mapNationality(a)
  const bNationality = mapNationality(b)
  const aNationalityPref = mapNationalityPref(a)
  const bNationalityPref = mapNationalityPref(b)

  // Participant name labels (fallback to assigned number)
  const aNameLabel = (a?.name || aSurvey?.name || aAns?.name || (a?.assigned_number ? `#${a.assigned_number}` : 'A')).toString()
  const bNameLabel = (b?.name || bSurvey?.name || bAns?.name || (b?.assigned_number ? `#${b.assigned_number}` : 'B')).toString()

  // Overall percentage and normalized section scores for summary
  const overallPercent = (() => {
    const v = typeof pair?.compatibility_score === 'number' ? pair.compatibility_score : 0
    return Math.round(v <= 1 ? v * 100 : v)
  })()

  const scores = {
    synergy: normalize(pair?.synergy_score as number, 35),
    lifestyle: normalize(pair?.lifestyle_compatibility_score as number, 15),
    humor: normalize(pair?.humor_open_score as number, 15),
    communication: normalize(pair?.communication_compatibility_score as number, 10),
    intent: normalize(pair?.intent_score as number, 5),
    vibe: normalize(pair?.vibe_compatibility_score as number, 20),
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] overflow-y-auto p-0" dir="rtl">
        {/* Header */}
        <div className="flex flex-col gap-4 px-6 py-5 border-b border-white/10 bg-linear-to-l from-slate-900 via-slate-800 to-slate-900">
          <div className="flex items-center justify-between gap-6">
            <DialogHeader>
              <DialogTitle className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-cyan-400" />
                تحليل التوافق والتأثيرات التفصيلية
              </DialogTitle>
            </DialogHeader>
            <div className="shrink-0 hidden md:block">
              <CircularProgressBar progress={overallPercent} size={120} strokeWidth={12} />
            </div>
          </div>
          {pair?.reason && (
            <div className="text-xs md:text-sm text-slate-300/90 bg-white/5 border border-white/10 rounded-lg px-3 py-2 w-full md:w-fit">
              <span className="text-slate-400">السبب:</span> {pair.reason}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-6 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-slate-950 via-slate-950 to-slate-900" dir="rtl">
          <Tabs defaultValue="summary" className="w-full">
            <TabsList className="bg-white/10 text-slate-200 border border-white/20">
              <TabsTrigger value="summary" className="text-slate-300 data-[state=active]:text-white data-[state=active]:bg-white/10">الملخص</TabsTrigger>
              <TabsTrigger value="synergy" className="text-slate-300 data-[state=active]:text-white data-[state=active]:bg-white/10">التفاعل</TabsTrigger>
              <TabsTrigger value="lifestyle" className="text-slate-300 data-[state=active]:text-white data-[state=active]:bg-white/10">نمط الحياة</TabsTrigger>
              <TabsTrigger value="communication" className="text-slate-300 data-[state=active]:text-white data-[state=active]:bg-white/10">التواصل</TabsTrigger>
              <TabsTrigger value="values" className="text-slate-300 data-[state=active]:text-white data-[state=active]:bg-white/10">القيم</TabsTrigger>
              <TabsTrigger value="humor" className="text-slate-300 data-[state=active]:text-white data-[state=active]:bg-white/10">الدعابة/الانفتاح</TabsTrigger>
              <TabsTrigger value="mbti" className="text-slate-300 data-[state=active]:text-white data-[state=active]:bg-white/10">MBTI</TabsTrigger>
            </TabsList>

            {/* Summary */}
            <TabsContent value="summary">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-3">
                {/* Column 1: Overall + breakdown */}
                <div className="bg-white/10 border border-white/20 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-slate-300 text-xs">التوافق الإجمالي</div>
                      <div className="text-3xl font-extrabold text-white">{overallPercent}%</div>
                    </div>
                    <div className="md:hidden">
                      <CircularProgressBar progress={overallPercent} size={90} strokeWidth={10} />
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <ScoreBar label="التفاعل" value={scores.synergy} max={35} color="bg-cyan-500" />
                    <ScoreBar label="الطاقة" value={scores.vibe} max={20} color="bg-violet-500" />
                    <ScoreBar label="نمط الحياة" value={scores.lifestyle} max={15} color="bg-emerald-500" />
                    <ScoreBar label="الدعابة/الانفتاح" value={scores.humor} max={15} color="bg-amber-500" />
                    <ScoreBar label="التواصل" value={scores.communication} max={10} color="bg-indigo-500" />
                    <ScoreBar label="الأهداف/القيم" value={scores.intent} max={5} color="bg-pink-500" />
                  </div>
                </div>

                {/* Column 2: Gates & Bonuses + Quick vibe */}
                <div className="space-y-4">
                  <div className="bg-white/10 border border-white/20 rounded-xl p-4">
                    <div className="text-slate-300 text-xs mb-2">القيود والمكافآت</div>
                    <div className="space-y-2 text-sm">
                      {pair?.humor_early_openness_bonus && pair.humor_early_openness_bonus !== 'none' && (
                        <div className="flex items-center gap-2 text-amber-300"><Sparkles className="w-4 h-4" /> مكافأة الدعابة/الانفتاح ({pair.humor_early_openness_bonus === 'full' ? 'كاملة ×1.15' : 'جزئية ×1.05'})</div>
                      )}
                      {pair?.intent_boost_applied && (
                        <div className="flex items-center gap-2 text-emerald-300"><BadgeCheck className="w-4 h-4" /> مضاعف الهدف ×1.1</div>
                      )}
                      {pair?.attachment_penalty_applied && (
                        <div className="flex items-center gap-2 text-red-300"><Shield className="w-4 h-4" /> عقوبة التعلق −5</div>
                      )}
                      {pair?.dead_air_veto_applied && (
                        <div className="flex items-center gap-2 text-red-300"><Info className="w-4 h-4" /> قيد الصمت: سقف 40%</div>
                      )}
                      {pair?.humor_clash_veto_applied && (
                        <div className="flex items-center gap-2 text-red-300"><Info className="w-4 h-4" /> تعارض الدعابة: سقف 50%</div>
                      )}
                      {pair?.cap_applied != null && (
                        <div className="flex items-center gap-2 text-yellow-300"><Zap className="w-4 h-4" /> تقييد نهائي: {pair.cap_applied}%</div>
                      )}
                      {!pair?.intent_boost_applied && !pair?.attachment_penalty_applied && !pair?.dead_air_veto_applied && !pair?.humor_clash_veto_applied && !pair?.cap_applied && (!pair?.humor_early_openness_bonus || pair.humor_early_openness_bonus === 'none') && (
                        <div className="text-slate-300">لا توجد قيود/مكافآت خاصة</div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white/10 border border-white/20 rounded-xl p-4">
                    <div className="text-slate-300 text-xs mb-2">لمحة عن الطاقة والشخصية</div>
                    <div className="space-y-1 text-xs text-slate-200">
                      {aAns?.vibe_1 && <div><span className="text-slate-300">{aNameLabel} - ويكند:</span> {String(aAns.vibe_1)}</div>}
                      {bAns?.vibe_1 && <div><span className="text-slate-300">{bNameLabel} - ويكند:</span> {String(bAns.vibe_1)}</div>}
                      {aAns?.vibe_2 && <div><span className="text-slate-300">{aNameLabel} - هوايات:</span> {String(aAns.vibe_2)}</div>}
                      {bAns?.vibe_2 && <div><span className="text-slate-300">{bNameLabel} - هوايات:</span> {String(bAns.vibe_2)}</div>}
                    </div>
                  </div>
                </div>

                {/* Column 3: Preferences */}
                <div className="bg-white/10 border border-white/20 rounded-xl p-4">
                  <div className="text-slate-300 text-xs mb-2">التفضيلات</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-200">
                    <div className="space-y-1">
                      <div><span className="text-slate-300">{aNameLabel} - الجنس المفضل:</span> {aGenderPref}</div>
                      <div><span className="text-slate-300">{aNameLabel} - العمر المفضل:</span> {aAgePref}</div>
                      <div><span className="text-slate-300">{aNameLabel} - الجنسية:</span> {aNationality}</div>
                      <div><span className="text-slate-300">{aNameLabel} - تفضيل الجنسية:</span> {aNationalityPref}</div>
                    </div>
                    <div className="space-y-1">
                      <div><span className="text-slate-300">{bNameLabel} - الجنس المفضل:</span> {bGenderPref}</div>
                      <div><span className="text-slate-300">{bNameLabel} - العمر المفضل:</span> {bAgePref}</div>
                      <div><span className="text-slate-300">{bNameLabel} - الجنسية:</span> {bNationality}</div>
                      <div><span className="text-slate-300">{bNameLabel} - تفضيل الجنسية:</span> {bNationalityPref}</div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Synergy */}
            <TabsContent value="synergy">
              <div className="bg-white/10 border border-white/20 rounded-xl p-4 mt-3">
                <div className="text-slate-100 font-semibold mb-3">التفاعل (حتى 35 نقطة) — {scores.synergy.toFixed(1)} / 35</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {Object.entries(SYNERGY_QUESTIONS).map(([key, label]) => (
                    <div key={key} className="bg-slate-900/70 border border-white/20 rounded-lg p-3">
                      <div className="text-slate-300 mb-1">{label}</div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}:  {VALUE_LABELS[String(aAns[key] || '').toUpperCase()] || String(aAns[key] || '—')}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}:  {VALUE_LABELS[String(bAns[key] || '').toUpperCase()] || String(bAns[key] || '—')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Lifestyle */}
            <TabsContent value="lifestyle">
              <div className="bg-white/10 border border-white/20 rounded-xl p-4 mt-3">
                <div className="text-slate-200 font-semibold mb-3">نمط الحياة (تأثير حتى 15 نقطة)</div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="bg-slate-900/70 border border-white/20 rounded-lg p-3">
                      <div className="text-slate-300 mb-1">{LIFESTYLE_QUESTIONS[i]}</div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}:  {lifestyleA[i-1] || '—'}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}:  {lifestyleB[i-1] || '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Communication */}
            <TabsContent value="communication">
              <div className="bg-white/10 border border-white/20 rounded-xl p-4 mt-3">
                <div className="text-slate-200 font-semibold mb-3">التواصل (حتى 10 نقاط)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {['communication_1','communication_2','communication_3','communication_4','communication_5'].map((k) => {
                    const meta = COMMUNICATION_QUESTIONS[k]
                    const aVal = String(aAns[k] || '')
                    const bVal = String(bAns[k] || '')
                    const same = aVal && bVal && aVal === bVal
                    return (
                      <div key={k} className={`bg-slate-900/70 border rounded-lg p-3 ${same ? 'border-green-400/30' : 'border-white/20'}`}>
                        <div className="text-slate-300 mb-1">{meta?.label || k}</div>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">
                            {aNameLabel}:  {meta?.options?.[aVal] || aVal || '—'}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">
                            {bNameLabel}:  {meta?.options?.[bVal] || bVal || '—'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </TabsContent>

            {/* Values */}
            <TabsContent value="values">
              <div className="bg-white/10 border border-white/20 rounded-xl p-4 mt-3">
                <div className="text-slate-200 font-semibold mb-3">القيم الأساسية (حتى 20 نقطة)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {['core_values_1','core_values_2','core_values_3','core_values_4','core_values_5'].map((k) => {
                    const meta = CORE_VALUES_QUESTIONS[k]
                    const aVal = String(aAns[k] || '')
                    const bVal = String(bAns[k] || '')
                    const same = aVal && bVal && aVal === bVal
                    return (
                      <div key={k} className={`bg-slate-900/70 border rounded-lg p-3 ${same ? 'border-green-400/30' : 'border-white/20'}`}>
                        <div className="text-slate-300 mb-1">{meta?.label || k}</div>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">
                            {aNameLabel}:  {meta?.options?.[aVal] || aVal || '—'}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">
                            {bNameLabel}:  {meta?.options?.[bVal] || bVal || '—'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Intent details within values tab */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mt-4">
                  <div className="bg-slate-900/70 border border-white/20 rounded-lg p-3">
                    <div className="text-slate-300 mb-1">الهدف من الحضور (حتى 5 نقاط)</div>
                    {(() => { const is = computeIntentScore(a, b); return (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}:  {String(is.a40 || '—')}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}:  {String(is.b40 || '—')}</span>
                        </div>
                        <div className="mt-2 text-slate-300">النقاط المحسوبة: <span className="text-emerald-300 font-semibold">{is.score}</span> / 5</div>
                      </>
                    ) })()}
                  </div>
                  <div className="bg-slate-900/70 border border-white/20 rounded-lg p-3">
                    <div className="text-slate-300 mb-1">ملخص القيم (اختياري)</div>
                    <div className="space-y-1">
                      <div className="text-slate-300">{aNameLabel}:  {String(a?.coreValues || aSurvey?.coreValues || '—')}</div>
                      <div className="text-slate-300">{bNameLabel}:  {String(b?.coreValues || bSurvey?.coreValues || '—')}</div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Humor & Early Openness */}
            <TabsContent value="humor">
              <div className="bg-white/10 border border-white/20 rounded-xl p-4 mt-3">
                <div className="text-slate-200 font-semibold mb-3">
                  الدعابة والانفتاح المبكر (حتى 15 نقطة) — {scores.humor.toFixed(1)} / 15
                </div>
                {(() => {
                  const hb = computeHumorOpenBreakdown(a, b)
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-900/70 border border-white/20 rounded-lg p-3">
                        <div className="text-slate-300 mb-1">أسلوب الدعابة/المزاح</div>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}:  {hb.hA || '—'}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}:  {hb.hB || '—'}</span>
                        </div>
                        <div className="mt-2 text-slate-300">نقاط الدعابة: <span className="text-amber-300 font-semibold">{hb.humorScore}</span> / 10 {hb.vetoClash ? '— تعارض قوي (A↔D)' : ''}</div>
                      </div>
                      <div className="bg-slate-900/70 border border-white/20 rounded-lg p-3">
                        <div className="text-slate-300 mb-1">الراحة مع الانفتاح المبكر</div>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}:  {hb.oA ?? '—'}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}:  {hb.oB ?? '—'}</span>
                        </div>
                        <div className="mt-2 text-slate-300">نقاط الانفتاح: <span className="text-amber-300 font-semibold">{hb.openScore}</span> / 5</div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </TabsContent>

            {/* MBTI */}
            <TabsContent value="mbti">
              <div className="bg-white/10 border border-white/20 rounded-xl p-4 mt-3">
                <div className="text-slate-200 font-semibold mb-3">MBTI (توضيحي فقط)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {['mbti_1','mbti_2','mbti_3','mbti_4'].map((k) => {
                    const meta = MBTI_QUESTIONS[k]
                    const aVal = String(aAns[k] || '')
                    const bVal = String(bAns[k] || '')
                    const same = aVal && bVal && aVal === bVal
                    return (
                      <div key={k} className={`bg-slate-900/70 border rounded-lg p-3 ${same ? 'border-green-400/30' : 'border-white/20'}`}>
                        <div className="text-slate-300 mb-1">{meta?.label || k}</div>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">
                            {aNameLabel}:  {meta?.options?.[aVal] || aVal || '—'}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">
                            {bNameLabel}:  {meta?.options?.[bVal] || bVal || '—'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
