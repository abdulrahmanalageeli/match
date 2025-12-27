import React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { BadgeCheck, Brain, Info, Shield, Sparkles, Zap } from "lucide-react"

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
  A: 'أ', B: 'ب', C: 'ج', D: 'د'
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
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-200 font-semibold">{value.toFixed(1)} / {max}</span>
      </div>
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function PairAnalysisModal({ open, onOpenChange, a, b, pair }: PairAnalysisModalProps) {
  const aAns = a?.survey_data?.answers || {}
  const bAns = b?.survey_data?.answers || {}

  const lifestyleA = (a?.lifestylePreferences as string | undefined)?.split(',') || []
  const lifestyleB = (b?.lifestylePreferences as string | undefined)?.split(',') || []

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

  const aGenderPref = mapGenderPref(a)
  const bGenderPref = mapGenderPref(b)
  const aAgePref = mapAgePref(a)
  const bAgePref = mapAgePref(b)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto p-0" dir="rtl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-cyan-400" />
              تحليل المقارنة بين الإجابات والتأثير على التوافق
            </DialogTitle>
          </DialogHeader>
          {pair?.reason && (
            <div className="text-xs text-slate-300 max-w-md">
              <span className="text-slate-400">السبب:</span> {pair.reason}
            </div>
          )}
        </div>

        <div className="p-6 space-y-6 bg-slate-950">
          {/* Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-slate-400 text-xs">التوافق الإجمالي</div>
              <div className="text-3xl font-extrabold text-white">{pair?.compatibility_score ?? 0}%</div>
              <div className="mt-3 space-y-2">
                <ScoreBar label="التفاعل" value={pair?.synergy_score ?? 0} max={35} color="bg-cyan-500" />
                <ScoreBar label="نمط الحياة" value={pair?.lifestyle_compatibility_score ?? 0} max={15} color="bg-emerald-500" />
                <ScoreBar label="الدعابة/الانفتاح" value={pair?.humor_open_score ?? 0} max={15} color="bg-amber-500" />
                <ScoreBar label="التواصل" value={pair?.communication_compatibility_score ?? 0} max={10} color="bg-indigo-500" />
                <ScoreBar label="الأهداف/القيم" value={pair?.intent_score ?? 0} max={5} color="bg-pink-500" />
                <ScoreBar label="الطاقة" value={pair?.vibe_compatibility_score ?? 0} max={20} color="bg-violet-500" />
              </div>
            </div>

            {/* Gates & Bonuses */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-slate-400 text-xs mb-2">القيود والمكافآت</div>
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
                  <div className="text-slate-500">لا توجد قيود/مكافآت خاصة</div>
                )}
              </div>
            </div>

            {/* Vibe snapshot */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-slate-400 text-xs mb-2">لمحة عن الطاقة والشخصية</div>
              <div className="space-y-1 text-xs text-slate-300">
                {aAns?.vibe_1 && <div><span className="text-slate-500">A- ويكند:</span> {String(aAns.vibe_1)}</div>}
                {bAns?.vibe_1 && <div><span className="text-slate-500">B- ويكند:</span> {String(bAns.vibe_1)}</div>}
                {aAns?.vibe_2 && <div><span className="text-slate-500">A- هوايات:</span> {String(aAns.vibe_2)}</div>}
                {bAns?.vibe_2 && <div><span className="text-slate-500">B- هوايات:</span> {String(bAns.vibe_2)}</div>}
              </div>
            </div>

            {/* Preferences snapshot */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-slate-400 text-xs mb-2">التفضيلات</div>
              <div className="space-y-2 text-xs text-slate-300">
                <div className="space-y-1">
                  <div><span className="text-slate-500">A- الجنس المفضل:</span> {aGenderPref}</div>
                  <div><span className="text-slate-500">A- العمر المفضل:</span> {aAgePref}</div>
                </div>
                <div className="space-y-1">
                  <div><span className="text-slate-500">B- الجنس المفضل:</span> {bGenderPref}</div>
                  <div><span className="text-slate-500">B- العمر المفضل:</span> {bAgePref}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Lifestyle Q14-18 comparison */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-slate-200 font-semibold mb-3">نمط الحياة (تأثير حتى 15 نقطة)</div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="bg-slate-900/60 border border-white/10 rounded-lg p-3">
                  <div className="text-slate-400 mb-1">{LIFESTYLE_QUESTIONS[i]}</div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">A: {lifestyleA[i-1] || '—'}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">B: {lifestyleB[i-1] || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MBTI comparison (Q5-8) */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-slate-200 font-semibold mb-3">MBTI (لا يؤثر مباشرة في 100 نقطة، لكنه يشرح التوافق)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {['mbti_1','mbti_2','mbti_3','mbti_4'].map((k) => {
                const meta = MBTI_QUESTIONS[k]
                const aVal = String(aAns[k] || '')
                const bVal = String(bAns[k] || '')
                const same = aVal && bVal && aVal === bVal
                return (
                  <div key={k} className={`bg-slate-900/60 border rounded-lg p-3 ${same ? 'border-green-400/30' : 'border-white/10'}`}>
                    <div className="text-slate-400 mb-1">{meta?.label || k}</div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">
                        A: {meta?.options?.[aVal] || aVal || '—'}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">
                        B: {meta?.options?.[bVal] || bVal || '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Attachment comparison (Q9-13) */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-slate-200 font-semibold mb-3">التعلق (مؤثر ضمنيًا عبر القيود)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {['attachment_1','attachment_2','attachment_3','attachment_4','attachment_5'].map((k) => {
                const meta = ATTACHMENT_QUESTIONS[k]
                const aVal = String(aAns[k] || '')
                const bVal = String(bAns[k] || '')
                const same = aVal && bVal && aVal === bVal
                return (
                  <div key={k} className={`bg-slate-900/60 border rounded-lg p-3 ${same ? 'border-green-400/30' : 'border-white/10'}`}>
                    <div className="text-slate-400 mb-1">{meta?.label || k}</div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">
                        A: {meta?.options?.[aVal] || aVal || '—'}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">
                        B: {meta?.options?.[bVal] || bVal || '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Communication comparison (Q24-28) */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-slate-200 font-semibold mb-3">التواصل (حتى 10 نقاط)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {['communication_1','communication_2','communication_3','communication_4','communication_5'].map((k) => {
                const meta = COMMUNICATION_QUESTIONS[k]
                const aVal = String(aAns[k] || '')
                const bVal = String(bAns[k] || '')
                const same = aVal && bVal && aVal === bVal
                return (
                  <div key={k} className={`bg-slate-900/60 border rounded-lg p-3 ${same ? 'border-green-400/30' : 'border-white/10'}`}>
                    <div className="text-slate-400 mb-1">{meta?.label || k}</div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">
                        A: {meta?.options?.[aVal] || aVal || '—'}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">
                        B: {meta?.options?.[bVal] || bVal || '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Core values comparison (Q19-23) */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-slate-200 font-semibold mb-3">الأهداف والقيم (حتى 5 نقاط)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {['core_values_1','core_values_2','core_values_3','core_values_4','core_values_5'].map((k) => {
                const meta = CORE_VALUES_QUESTIONS[k]
                const aVal = String(aAns[k] || '')
                const bVal = String(bAns[k] || '')
                const same = aVal && bVal && aVal === bVal
                return (
                  <div key={k} className={`bg-slate-900/60 border rounded-lg p-3 ${same ? 'border-green-400/30' : 'border-white/10'}`}>
                    <div className="text-slate-400 mb-1">{meta?.label || k}</div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">
                        A: {meta?.options?.[aVal] || aVal || '—'}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">
                        B: {meta?.options?.[bVal] || bVal || '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Synergy comparison */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-slate-200 font-semibold mb-3">التفاعل (حتى 35 نقطة)</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {Object.entries(SYNERGY_QUESTIONS).map(([key, label]) => (
                <div key={key} className="bg-slate-900/60 border border-white/10 rounded-lg p-3">
                  <div className="text-slate-400 mb-1">{label}</div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">A: {VALUE_LABELS[String(aAns[key] || '').toUpperCase()] || String(aAns[key] || '—')}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">B: {VALUE_LABELS[String(bAns[key] || '').toUpperCase()] || String(bAns[key] || '—')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Goals & Values snapshot */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-slate-200 font-semibold mb-3">الأهداف والقيم (حتى 5 نقاط)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-900/60 border border-white/10 rounded-lg p-3">
                <div className="text-slate-400 mb-1">الهدف من الحضور</div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">A: {String(aAns.intent_goal || '—')}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">B: {String(bAns.intent_goal || '—')}</span>
                </div>
              </div>
              <div className="bg-slate-900/60 border border-white/10 rounded-lg p-3">
                <div className="text-slate-400 mb-1">القيم الأساسية (5 أسئلة)</div>
                <div className="space-y-1">
                  <div className="text-slate-400">A: {String(a?.coreValues || a?.survey_data?.coreValues || '—')}</div>
                  <div className="text-slate-400">B: {String(b?.coreValues || b?.survey_data?.coreValues || '—')}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
