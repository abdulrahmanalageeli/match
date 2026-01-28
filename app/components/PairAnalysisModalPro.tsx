import React, { useMemo, useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { BadgeCheck, Brain, Info, Shield, Sparkles, Zap, Copy, Users, MessageCircle, Home, Star, CheckCircle } from "lucide-react"
import CircularProgressBar from "./CircularProgressBar"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs"

interface PairAnalysisModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  a?: any
  b?: any
  pair?: {
    compatibility_score: number
    synergy_score?: number
    lifestyle_compatibility_score?: number
    humor_open_score?: number
    communication_compatibility_score?: number
    intent_score?: number
    core_values_compatibility_score?: number
    vibe_compatibility_score?: number
    humor_early_openness_bonus?: 'full' | 'partial' | 'none'
    intent_boost_applied?: boolean
    attachment_penalty_applied?: boolean
    dead_air_veto_applied?: boolean
    humor_clash_veto_applied?: boolean
    cap_applied?: number | null
    reason?: string
  } | null
  // Previous matches (like hover tooltips in Participant modal)
  historyA?: Array<{ partner_number: number; partner_name?: string; event_id?: number }>
  historyB?: Array<{ partner_number: number; partner_name?: string; event_id?: number }>
  currentEventId?: number
}

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

// Option label mappings (aligned with SurveyComponent.tsx)
const SYNERGY_OPTIONS: Record<string, Record<string, string>> = {
  conversational_role: {
    A: "أ. المبادر: أنا اللي أفتح المواضيع وأحرك الجو.",
    B: "ب. المتفاعل: أشارك بحماس وأرد على اللي ينقال.",
    C: "ج. المستمع: أحب أسمع أكثر من إني أتكلم وأركز في التفاصيل.",
  },
  conversation_depth_pref: {
    A: "أ. العميقة: أحب نحلل \"ليه وكيف\" ونغوص في الفلسفة والأسباب.",
    B: "ب. الواقعية: أحب نتكلم عن \"وش صار ومتى\" وأخبار اليوم والأشياء الملموسة.",
  },
  social_battery: {
    A: "أ. تزيد: أحس إني نشطت وأبي أكمل السهرة.",
    B: "ب. تقل: استمتعت بس أحس \"بطاريتي\" بدت تخلص وأحتاج هدوء.",
  },
  humor_subtype: {
    A: "أ. الذبّات والسرعة: الذكاء في الرد والسخرية الخفيفة.",
    B: "ب. المواقف العفوية: الأشياء اللي تصير فجأة وبدون تخطيط.",
    C: "ج. القصص والسرد: طريقة حكي السالفة وتفاصيلها المضحكة.",
  },
  curiosity_style: {
    A: "أ. إنه يسألني أسئلة عميقة عن نفسي وتجاربي.",
    B: "ب. إني أنا اللي أسأله وأكتشف تفاصيل حياته.",
    C: "ج. \"الأخذ والعطاء\" السريع والمزح بدون رسميات.",
  },
  silence_comfort: {
    A: "أ. قلق: أحس لازم أقول أي شيء عشان أكسر الصمت.",
    B: "ب. راحة: عادي عندي، الهدوء جزء من السالفة ولا يوترني.",
  },
}

const LIFESTYLE_OPTIONS: Record<number, Record<string, string>> = {
  1: {
    'أ': "أ. في الصباح – أكون نشيطًا ومنتجًا في الساعات الأولى",
    'ب': "ب. بعد الظهر أو المغرب – أبدأ أرتاح وأتفاعل أكثر في هذا الوقت",
    'ج': "ج. في الليل – أفضّل السهر وأكون أكثر تفاعلًا في المساء",
  },
  2: {
    'أ': "أ. أحب التواصل اليومي أو شبه اليومي",
    'ب': "ب. يكفيني التواصل كل يومين أو ثلاثة",
    'ج': "ج. أرتاح إذا كان التواصل متباعد بدون ضغط أو التزام",
  },
  3: {
    'أ': "أ. أحتاج وقتًا لنفسي كل يوم، حتى مع أقرب الناس",
    'ب': "ب. أحب قضاء وقت طويل مع صديقي لكن أقدّر المساحة أحيانًا",
    'ج': "ج. أرتاح أكثر إذا كنا دائمًا متواصلين أو متشاركين في الأنشطة",
  },
  4: {
    'أ': "أ. أحب التنظيم والتخطيط المسبق، حتى في اللقاءات مع الأصدقاء",
    'ب': "ب. أُفضل وجود فكرة عامة، لكن أحب التفاعل بعفوية",
    'ج': "ج. لا أحب التخطيط، أترك الأمور تمشي بطبيعتها",
  },
  5: {
    'أ': "أ. أخرج كثيرًا، أحب النشاطات والجلسات الاجتماعية",
    'ب': "ب. أُفضل الجلسات الهادئة مع شخص أو اثنين",
    'ج': "ج. أُحب البقاء وحدي أو تقليل التواصل خلال نهاية الأسبوع",
  },
}

const HUMOR_BANTER_OPTIONS: Record<string, string> = {
  A: "أ. خفة دم وضحك",
  B: "ب. كلام لطيف ومجاملة",
  C: "ج. هدوء وصدق",
  D: "د. المباشرة والجدية",
}

const EARLY_OPENNESS_LABELS: Record<number, string> = {
  0: "أ. أحتفظ بالأمور الشخصية حتى أتعرف عليهم جيداً",
  1: "ب. أفضل الحديث السطحي في البداية",
  2: "ج. أحب المشاركة المتوازنة - مزيج من الخفيف والحقيقي",
  3: "د. أنفتح بسرعة وأشارك القصص الشخصية",
}

const INTENT_GOAL_OPTIONS: Record<string, string> = {
  A: "أ. ودي أوسع دائرة معارفي وأكون صداقات جديدة ورهيبة.",
  B: "ب. أبحث عن شيء أعمق: شخص يفهمني فكرياً ونكون على \"نفس الموجة\" تماماً.",
  C: "ج. جاي أجرب تجربة اجتماعية جديدة وأغير جو.",
}

const VALUE_LABELS: Record<string, string> = { A: 'أ', B: 'ب', C: 'ج', D: 'د' }

const MBTI_QUESTIONS: Record<string, { label: string, options: Record<string, string> }> = {
  mbti_1: {
    label: "عندما تتم دعوتك إلى مناسبة اجتماعية كبيرة، هل:",
    options: { 'أ': "تشعر بالحماس للتعرّف على أشخاص جدد وتبقى حتى آخر الحفل", 'ب': "تغادر مبكرًا لوقت هادئ بعد فترة وجيزة" }
  },
  mbti_2: {
    label: "عندما تواجه مشكلة جديدة أو تحديًا غير مألوف، كيف تتعامل معه غالبًا؟",
    options: { 'أ': "أطبّق حلولًا مجرّبة وواضحة", 'ب': "أتبع حدسي وأستكشف حلولًا جديدة" }
  },
  mbti_3: { label: "عند اتخاذ قرار يؤثر على الآخرين، تميل إلى:", options: { 'أ': "إعطاء الأولوية للمنطق", 'ب': "مراعاة مشاعر الآخرين" } },
  mbti_4: { label: "إذا تغيّرت خطتك فجأة، كيف تشعر؟", options: { 'أ': "توتر وتفضيل الالتزام بالخطة", 'ب': "تأقلم بسهولة وفرصة لتجربة جديدة" } },
}

const ATTACHMENT_QUESTIONS: Record<string, { label: string, options: Record<string, string> }> = {
  attachment_1: { label: "إذا لم يتواصل صديقك لأيام:", options: { 'أ': 'أتفهم ولا أقلق', 'ب': 'أظن أنني أخطأت', 'ج': 'لا أحب الاعتماد كثيرًا', 'د': 'توتر وتذبذب' } },
  attachment_2: { label: "عند حدوث خلاف:", options: { 'أ': 'أواجه بهدوء', 'ب': 'أتجنب المواجهة', 'ج': 'أنسحب', 'د': 'أقترب ثم أبتعد' } },
  attachment_3: { label: "القرب العاطفي:", options: { 'أ': 'مرتاح وأعبر', 'ب': 'أحتاج طمأنة', 'ج': 'لا أرتاح', 'د': 'أخاف الرفض' } },
  attachment_4: { label: "في الأوقات الصعبة:", options: { 'أ': 'أشارك وأثق بدعمهم', 'ب': 'أحتاجهم بشدة', 'ج': 'أحل وحدي', 'د': 'أطلب ثم أنسحب' } },
  attachment_5: { label: "العلاقات طويلة المدى:", options: { 'أ': 'أراها صحية', 'ب': 'مهمة لكن أخاف', 'ج': 'أفضل الخفيفة', 'د': 'أرتبك وأتجنب' } },
}

const COMMUNICATION_QUESTIONS: Record<string, { label: string, options: Record<string, string> }> = {
  communication_1: { label: "إذا تخطى أحد حدودك:", options: { 'أ': 'أواجه بلطف وصراحة', 'ب': 'أكتم المشاعر', 'ج': 'أهاجم مباشرة', 'د': 'تلميحات غير مباشرة' } },
  communication_2: { label: "عند طلب شيء:", options: { 'أ': 'أطلب بوضوح', 'ب': 'أتمنى أن يلاحظ', 'ج': 'بإلحاح/ضغط', 'د': 'أقول لا مشكلة وأتضايق' } },
  communication_3: { label: "عند اختلاف رأي:", options: { 'أ': 'أوضح بهدوء', 'ب': 'أوافق ظاهريًا', 'ج': 'أهاجم الرأي', 'د': 'صمت وتلميحات لاحقًا' } },
  communication_4: { label: "عند التوتر:", options: { 'أ': 'أشارك بصراحة باحترام', 'ب': 'أكتم وأتجنب', 'ج': 'أنفجر', 'د': 'أبدو بخير وأعاقب بالصمت' } },
  communication_5: { label: "عند عدم الموافقة:", options: { 'أ': 'أشرح باحترام', 'ب': 'أفضل السكوت', 'ج': 'أصرّ وأقلل', 'د': 'سخرية/تلميحات' } },
}

const CORE_VALUES_QUESTIONS: Record<string, { label: string, options: Record<string, string> }> = {
  core_values_1: { label: "الصدق أم العلاقة؟", options: { 'أ': 'أخبر الحقيقة', 'ب': 'أغيّر الموضوع', 'ج': 'أغطي على صديقي' } },
  core_values_2: { label: "الطموح أم الاستقرار؟", options: { 'أ': 'أشجع تمامًا', 'ب': 'أتريث قليلاً', 'ج': 'ترك الاستقرار مخاطرة' } },
  core_values_3: { label: "التقبل أم التشابه؟", options: { 'أ': 'الاختلاف لا يهم', 'ب': 'ربما يرهقني لاحقًا', 'ج': 'أفضل التشابه' } },
  core_values_4: { label: "الاعتماد أم الاستقلال؟", options: { 'أ': 'أفضل الخصوصية', 'ب': 'كنت أتمنى تواصلًا أكثر', 'ج': 'شعور بالإهمال' } },
  core_values_5: { label: "الواجب أم الحرية؟", options: { 'أ': 'لكل شخص حكمه', 'ب': 'أقلل تواصل احترامًا', 'ج': 'أقف معه' } },
}

// Visual helpers
const getTierName = (p: number) => (p >= 85 ? 'ممتاز' : p >= 70 ? 'جيد جدًا' : p >= 55 ? 'جيد' : p >= 40 ? 'مقبول' : 'ضعيف')
const getInitial = (s: string) => { const t = (s || '').replace(/^#/, '').trim(); return t ? t[0].toUpperCase() : '—' }
const computeTopSynergyDrivers = (details: Array<{ label: string, scaled: number }>) => details.slice().sort((a,b)=> (b.scaled||0)-(a.scaled||0)).filter(d=> (d.scaled||0)>0).slice(0,2)

function ScoreBar({ label, value, max, color, icon }: { label: string, value: number, max: number, color: string, icon?: React.ReactNode }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs md:text-sm">
        <span className="flex items-center gap-1.5 text-slate-200 font-medium">
          {icon && <span className="shrink-0">{icon}</span>}
          <span>{label}</span>
        </span>
        <span className="text-slate-100 font-bold">{value.toFixed(1)} / {max}</span>
      </div>
      <div className="h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden">
        <div className={`h-full ${color} brightness-110 shadow-[0_0_12px_rgba(255,255,255,0.10)]`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function PairAnalysisModal({ open, onOpenChange, a, b, pair, historyA = [], historyB = [], currentEventId = 1 }: PairAnalysisModalProps) {
  const parseJSON = (s: any) => { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}) } catch { return {} } }
  const aSurvey = parseJSON(a?.survey_data)
  const bSurvey = parseJSON(b?.survey_data)
  const aAns = aSurvey?.answers || {}
  const bAns = bSurvey?.answers || {}

  const normalize = (val: number | undefined, max: number): number => { if (typeof val !== 'number' || isNaN(val)) return 0; return val <= 1 ? val * max : val }

  const computeHumorOpenBreakdown = (pa: any, pb: any) => {
    const getAns = (p: any, key: string) => p?.survey_data?.answers?.[key] ?? p?.survey_data?.[key] ?? p?.[key] ?? undefined
    const rawHumorA = getAns(pa, 'humor_banter_style'); const rawHumorB = getAns(pb, 'humor_banter_style')
    const hA = rawHumorA ? String(rawHumorA).toUpperCase() : ''; const hB = rawHumorB ? String(rawHumorB).toUpperCase() : ''
    const rawOpenA = getAns(pa, 'early_openness_comfort'); const rawOpenB = getAns(pb, 'early_openness_comfort')
    const oA = rawOpenA !== undefined && rawOpenA !== null ? parseInt(rawOpenA) : undefined
    const oB = rawOpenB !== undefined && rawOpenB !== null ? parseInt(rawOpenB) : undefined
    let humorScore = 0; let vetoClash = false
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

  const computeSynergyScore = (pa: any, pb: any) => {
    const getA = (p: any, k: string) => p?.survey_data?.answers?.[k] ?? p?.[k] ?? ''
    const a35 = String(getA(pa, 'conversational_role') || '').toUpperCase(); const b35 = String(getA(pb, 'conversational_role') || '').toUpperCase()
    const a36 = String(getA(pa, 'conversation_depth_pref') || '').toUpperCase(); const b36 = String(getA(pb, 'conversation_depth_pref') || '').toUpperCase()
    const a37 = String(getA(pa, 'social_battery') || '').toUpperCase(); const b37 = String(getA(pb, 'social_battery') || '').toUpperCase()
    const a38 = String(getA(pa, 'humor_subtype') || '').toUpperCase(); const b38 = String(getA(pb, 'humor_subtype') || '').toUpperCase()
    const a39 = String(getA(pa, 'curiosity_style') || '').toUpperCase(); const b39 = String(getA(pb, 'curiosity_style') || '').toUpperCase()
    const a41 = String(getA(pa, 'silence_comfort') || '').toUpperCase(); const b41 = String(getA(pb, 'silence_comfort') || '').toUpperCase()
    let total = 0
    if ((a35 === 'A' && (b35 === 'B' || b35 === 'C')) || (b35 === 'A' && (a35 === 'B' || a35 === 'C'))) total += 7
    else if (a35 === 'B' && b35 === 'B') total += 4
    else if (a35 === 'A' && b35 === 'A') total += 2
    else if (a35 === 'C' && b35 === 'C') total += 0
    else if (a35 && b35) total += 3
    if (a36 && b36) total += (a36 === b36 ? 5 : 1)
    if (a37 && b37) { if (a37 === 'A' && b37 === 'A') total += 4; else if (a37 === 'B' && b37 === 'B') total += 3; else total += 1 }
    if (a38 && b38) total += (a38 === b38 ? 4 : 1)
    if (a39 && b39) { if ((a39 === 'A' && b39 === 'B') || (a39 === 'B' && b39 === 'A')) total += 5; else if (a39 === 'C' && b39 === 'C') total += 5; else if ((a39 === 'A' && b39 === 'A') || (a39 === 'B' && b39 === 'B')) total += 0; else total += 3 }
    if (a41 && b41) { if ((a41 === 'A' && b41 === 'B') || (a41 === 'B' && b41 === 'A')) total += 5; else if (a41 === 'A' && b41 === 'A') total += 3; else if (a41 === 'B' && b41 === 'B') total += 0 }
    return Math.min(35, (total * (35 / 30)))
  }

  const computeSynergyDetails = (pa: any, pb: any) => {
    const getA = (p: any, k: string) => p?.survey_data?.answers?.[k] ?? p?.[k] ?? ''
    const a35 = String(getA(pa, 'conversational_role') || '').toUpperCase(); const b35 = String(getA(pb, 'conversational_role') || '').toUpperCase()
    const a36 = String(getA(pa, 'conversation_depth_pref') || '').toUpperCase(); const b36 = String(getA(pb, 'conversation_depth_pref') || '').toUpperCase()
    const a37 = String(getA(pa, 'social_battery') || '').toUpperCase(); const b37 = String(getA(pb, 'social_battery') || '').toUpperCase()
    const a38 = String(getA(pa, 'humor_subtype') || '').toUpperCase(); const b38 = String(getA(pb, 'humor_subtype') || '').toUpperCase()
    const a39 = String(getA(pa, 'curiosity_style') || '').toUpperCase(); const b39 = String(getA(pb, 'curiosity_style') || '').toUpperCase()
    const a41v = String(getA(pa, 'silence_comfort') || '').toUpperCase(); const b41v = String(getA(pb, 'silence_comfort') || '').toUpperCase()
    const out: Array<{ key: string, aVal: string, bVal: string, raw: number, scaled: number, maxRaw: number, label: string }> = []
    const scale = 35 / 30
    let q35 = 0
    if ((a35 === 'A' && (b35 === 'B' || b35 === 'C')) || (b35 === 'A' && (a35 === 'B' || a35 === 'C'))) q35 = 7
    else if (a35 === 'B' && b35 === 'B') q35 = 4
    else if (a35 === 'A' && b35 === 'A') q35 = 2
    else if (a35 === 'C' && b35 === 'C') q35 = 0
    else if (a35 && b35) q35 = 3
    out.push({ key: 'conversational_role', aVal: a35, bVal: b35, raw: q35, scaled: q35 * scale, maxRaw: 7, label: SYNERGY_QUESTIONS.conversational_role })
    let q36 = 0; if (a36 && b36) q36 = (a36 === b36 ? 5 : 1)
    out.push({ key: 'conversation_depth_pref', aVal: a36, bVal: b36, raw: q36, scaled: q36 * scale, maxRaw: 5, label: SYNERGY_QUESTIONS.conversation_depth_pref })
    let q37 = 0; if (a37 && b37) { if (a37 === 'A' && b37 === 'A') q37 = 4; else if (a37 === 'B' && b37 === 'B') q37 = 3; else q37 = 1 }
    out.push({ key: 'social_battery', aVal: a37, bVal: b37, raw: q37, scaled: q37 * scale, maxRaw: 4, label: SYNERGY_QUESTIONS.social_battery })
    let q38 = 0; if (a38 && b38) q38 = (a38 === b38 ? 4 : 1)
    out.push({ key: 'humor_subtype', aVal: a38, bVal: b38, raw: q38, scaled: q38 * scale, maxRaw: 4, label: SYNERGY_QUESTIONS.humor_subtype })
    let q39 = 0; if (a39 && b39) { if ((a39 === 'A' && b39 === 'B') || (a39 === 'B' && b39 === 'A')) q39 = 5; else if (a39 === 'C' && b39 === 'C') q39 = 5; else if ((a39 === 'A' && b39 === 'A') || (a39 === 'B' && b39 === 'B')) q39 = 0; else q39 = 3 }
    out.push({ key: 'curiosity_style', aVal: a39, bVal: b39, raw: q39, scaled: q39 * scale, maxRaw: 5, label: SYNERGY_QUESTIONS.curiosity_style })
    let q41 = 0; if (a41v && b41v) { if ((a41v === 'A' && b41v === 'B') || (a41v === 'B' && b41v === 'A')) q41 = 5; else if (a41v === 'A' && b41v === 'A') q41 = 3; else if (a41v === 'B' && b41v === 'B') q41 = 0 }
    out.push({ key: 'silence_comfort', aVal: a41v, bVal: b41v, raw: q41, scaled: q41 * scale, maxRaw: 5, label: SYNERGY_QUESTIONS.silence_comfort })
    return out
  }

  // Compute detailed Lifestyle scoring per question (Q14-18) with bonus/penalty
  const computeLifestyleDetails = (listA: string[], listB: string[]) => {
    const items: Array<{ idx: number, label: string, aVal: string, bVal: string, points: number, max: number }> = []
    let q14Match = false
    let q18Match = false
    let total = 0

    // Helpers mirror trigger-match logic
    const bucket16 = (v: string) => (v === 'ج' ? 'close' : 'space')

    // Q14 (index 0): exact match → 3 pts
    {
      const a = listA[0] || ''
      const b = listB[0] || ''
      const pts = a && b && a === b ? 3 : 0
      if (pts === 3) q14Match = true
      total += pts
      items.push({ idx: 1, label: LIFESTYLE_QUESTIONS[1], aVal: a, bVal: b, points: pts, max: 3 })
    }

    // Q15 (index 1): exact match → 3 pts
    {
      const a = listA[1] || ''
      const b = listB[1] || ''
      const pts = a && b && a === b ? 3 : 0
      total += pts
      items.push({ idx: 2, label: LIFESTYLE_QUESTIONS[2], aVal: a, bVal: b, points: pts, max: 3 })
    }

    // Q16 (index 2): same bucket → 3 pts
    {
      const a = listA[2] || ''
      const b = listB[2] || ''
      const pts = (a && b && bucket16(a) === bucket16(b)) ? 3 : 0
      total += pts
      items.push({ idx: 3, label: LIFESTYLE_QUESTIONS[3], aVal: a, bVal: b, points: pts, max: 3 })
    }

    // Q17 (index 3): exact match → 3 pts
    {
      const a = listA[3] || ''
      const b = listB[3] || ''
      const pts = a && b && a === b ? 3 : 0
      total += pts
      items.push({ idx: 4, label: LIFESTYLE_QUESTIONS[4], aVal: a, bVal: b, points: pts, max: 3 })
    }

    // Q18 (index 4): exact match → 3 pts (plus special rules)
    {
      const a = listA[4] || ''
      const b = listB[4] || ''
      const pts = a && b && a === b ? 3 : 0
      if (pts === 3) q18Match = true
      total += pts
      items.push({ idx: 5, label: LIFESTYLE_QUESTIONS[5], aVal: a, bVal: b, points: pts, max: 3 })
    }

    // Shared Context bonus: if Q14 & Q18 matched → +2
    const bonus = (q14Match && q18Match) ? 2 : 0
    // Clash penalty: A vs C on Q18 → -7
    const a18 = listA[4] || ''
    const b18 = listB[4] || ''
    const penalty = ((a18 === 'أ' && b18 === 'ج') || (a18 === 'ج' && b18 === 'أ')) ? -7 : 0

    const computed = Math.max(0, Math.min(15, total + bonus + penalty))
    return { items, bonus, penalty, computed }
  }

  // Compute Core Values per-question points (0..4) based on adjacent/identical rules
  const computeCoreValuesDetails = (ansA: any, ansB: any) => {
    const keys = ['core_values_1','core_values_2','core_values_3','core_values_4','core_values_5']
    const items: Array<{ key: string, label: string, aVal: string, bVal: string, points: number, max: number }> = []
    let total = 0
    for (const k of keys) {
      const meta = CORE_VALUES_QUESTIONS[k]
      const a = String(ansA[k] || '')
      const b = String(ansB[k] || '')
      let pts = 0
      if (a && b) {
        if (a === b) pts = 4
        else if ((a === 'ب' && (b === 'أ' || b === 'ج')) || (b === 'ب' && (a === 'أ' || a === 'ج'))) pts = 2
        else pts = 0
      }
      total += pts
      items.push({ key: k, label: meta?.label || k, aVal: a, bVal: b, points: pts, max: 4 })
    }
    return { items, total } // total out of 20
  }

  const deriveLifestyleList = (p: any, survey: any, ans: any): string[] => {
    const fromRow = typeof p?.lifestylePreferences === 'string' ? p.lifestylePreferences : undefined
    const fromSurvey = typeof survey?.lifestylePreferences === 'string' ? survey.lifestylePreferences : undefined
    const raw = fromRow || fromSurvey
    if (raw && raw.includes(',')) return raw.split(',').map((s: string) => s.trim())
    const list = [ans.lifestyle_1, ans.lifestyle_2, ans.lifestyle_3, ans.lifestyle_4, ans.lifestyle_5].filter(Boolean)
    return list as string[]
  }

  const mapGenderPref = (p: any): string => {
    const ans = p?.survey_data?.answers || {}
    const raw = ans.actual_gender_preference || ans.gender_preference
    if (raw === 'any_gender' || p?.any_gender_preference) return 'أي جنس'
    if (raw === 'same_gender' || p?.same_gender_preference) return 'نفس الجنس فقط'
    if (raw === 'opposite_gender') return 'الجنس المقابل'
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

  const mapGenderLabel = (p: any): string => {
    const ans = p?.survey_data?.answers || {}
    const raw = String(p?.gender ?? ans.gender ?? '').toLowerCase()
    if (raw === 'male' || raw === 'm' || raw === 'ذكر') return 'ذكر'
    if (raw === 'female' || raw === 'f' || raw === 'أنثى') return 'أنثى'
    return 'غير محدد'
  }

  const mapNationality = (p: any): string => p?.nationality || (p?.survey_data?.answers || {}).nationality || 'غير محدد'
  const mapNationalityPref = (p: any): string => {
    const ans = p?.survey_data?.answers || {}
    const pref = ans.nationality_preference
    if (pref === 'same') return 'نفس الجنسية'
    if (pref === 'any') return 'أي جنسية'
    if (typeof p?.prefer_same_nationality === 'boolean') return p.prefer_same_nationality ? 'نفس الجنسية' : 'أي جنسية'
    return 'غير محدد'
  }

  const lifestyleA = deriveLifestyleList(a, aSurvey, aAns)
  const lifestyleB = deriveLifestyleList(b, bSurvey, bAns)

  const aNameLabel = (a?.name || aSurvey?.name || aAns?.name || (a?.assigned_number ? `#${a.assigned_number}` : 'A')).toString()
  const bNameLabel = (b?.name || bSurvey?.name || bAns?.name || (b?.assigned_number ? `#${b.assigned_number}` : 'B')).toString()
  const aNumber = a?.assigned_number
  const bNumber = b?.assigned_number
  const aMBTI = a?.mbti_personality_type || aSurvey?.mbtiType
  const bMBTI = b?.mbti_personality_type || bSurvey?.mbtiType

  // Preferences quick values and alignment checks for comparison table
  const aGenderPref = mapGenderPref(a)
  const bGenderPref = mapGenderPref(b)
  const aAgePref = mapAgePref(a)
  const bAgePref = mapAgePref(b)
  const aNationality = mapNationality(a)
  const bNationality = mapNationality(b)
  const genderPrefAlign = aGenderPref === bGenderPref
  const agePrefAlign = aAgePref === bAgePref
  const nationalityAlign = aNationality === bNationality

  // Ages (robust extraction from row, survey root, or answers)
  const getAgeNum = (val: any) => { const n = parseInt(String(val ?? ''), 10); return isNaN(n) ? null : n }
  const aAgeVal = a?.age ?? aSurvey?.age ?? aAns?.age
  const bAgeVal = b?.age ?? bSurvey?.age ?? bAns?.age
  const aAgeNum = getAgeNum(aAgeVal)
  const bAgeNum = getAgeNum(bAgeVal)
  const aAgeLabel = aAgeNum !== null ? aAgeNum : (aAgeVal ?? null)
  const bAgeLabel = bAgeNum !== null ? bAgeNum : (bAgeVal ?? null)
  const ageDiff = (aAgeNum !== null && bAgeNum !== null) ? Math.abs(aAgeNum - bAgeNum) : null

  const overallPercent = (() => { const v = typeof pair?.compatibility_score === 'number' ? pair.compatibility_score : 0; return Math.round(v <= 1 ? v * 100 : v) })()
  // Show unbonused percentage (divide out multipliers) if any multiplier applied
  const intentApplied = !!pair?.intent_boost_applied
  const humorApplied = !!(pair?.humor_early_openness_bonus && pair.humor_early_openness_bonus !== 'none')
  const totalMultiplier = (intentApplied ? 1.05 : 1.0) * (humorApplied ? 1.05 : 1.0)
  const unbonusedPercent = totalMultiplier > 1.0 ? Math.round(overallPercent / totalMultiplier) : null
  const tierName = getTierName(overallPercent)

  const hbForSummary = computeHumorOpenBreakdown(a, b)
  const computedSynergy = computeSynergyScore(a, b)
  const computedIntent = (() => {
    // intent score mapping (0..5)
    const getAns = (p: any, key: string) => p?.survey_data?.answers?.[key] ?? p?.[key] ?? ''
    const a40 = String(getAns(a, 'intent_goal') || '').toUpperCase()
    const b40 = String(getAns(b, 'intent_goal') || '').toUpperCase()
    let score = 0
    if (!a40 || !b40) score = 0
    else if ((a40 === 'A' && b40 === 'A') || (a40 === 'B' && b40 === 'B')) score = 5
    else if (a40 === 'C' && b40 === 'C') score = 3
    else if ((a40 === 'A' && b40 === 'B') || (a40 === 'B' && b40 === 'A')) score = 1
    else if ((a40 === 'A' && b40 === 'C') || (a40 === 'C' && b40 === 'A')) score = 3
    else if ((a40 === 'B' && b40 === 'C') || (a40 === 'C' && b40 === 'B')) score = 1
    return score
  })()

  const scores = {
    synergy: pair?.synergy_score !== undefined && pair?.synergy_score !== null ? normalize(pair.synergy_score as number, 35) : normalize(computedSynergy, 35),
    lifestyle: normalize(pair?.lifestyle_compatibility_score as number, 15),
    humor: pair?.humor_open_score !== undefined && pair?.humor_open_score !== null ? normalize(pair.humor_open_score as number, 15) : normalize(hbForSummary.total, 15),
    communication: normalize(pair?.communication_compatibility_score as number, 10),
    coreValues: normalize(pair?.core_values_compatibility_score as number, 20),
    vibe: normalize(pair?.vibe_compatibility_score as number, 20),
  }
  const coreValues5 = Math.max(0, Math.min(5, (scores.coreValues / 20) * 5))

  const humorMultiplier = useMemo(() => {
    const getAns = (p: any, key: string) => p?.survey_data?.answers?.[key] ?? p?.survey_data?.[key] ?? p?.[key] ?? undefined
    const hA = getAns(a, 'humor_banter_style'); const hB = getAns(b, 'humor_banter_style')
    const humorMatches = hA && hB && String(hA).toUpperCase() === String(hB).toUpperCase()
    return humorMatches ? 1.05 : 1.0
  }, [a, b])

  const synergyDetails = useMemo(() => computeSynergyDetails(a, b), [a, b])
  const lifestyleDetails = useMemo(() => computeLifestyleDetails(lifestyleA, lifestyleB), [lifestyleA, lifestyleB])
  const coreValuesDetails = useMemo(() => computeCoreValuesDetails(aAns, bAns), [aAns, bAns])
  const aAI = a?.ai_personality_analysis || aSurvey?.ai_personality_analysis
  const bAI = b?.ai_personality_analysis || bSurvey?.ai_personality_analysis
  const hasAi = !!(aAI || bAI)

  // Previous matches -> similarity/feedback enrichment state
  const [allMatchesCache, setAllMatchesCache] = useState<any[] | null>(null)
  const [loadingPrevKey, setLoadingPrevKey] = useState<string | null>(null)
  const [prevMetaA, setPrevMetaA] = useState<Record<string, { similarity?: number, feedback?: number | null, compatibility?: number | null, vec?: any }>>({})
  const [prevMetaB, setPrevMetaB] = useState<Record<string, { similarity?: number, feedback?: number | null, compatibility?: number | null, vec?: any }>>({})
  // Organizer impressions per person (across events)
  const [orgImpressionsA, setOrgImpressionsA] = useState<Array<{ text: string; eventId?: number; partner?: number; submitted_at?: string }>>([])
  const [orgImpressionsB, setOrgImpressionsB] = useState<Array<{ text: string; eventId?: number; partner?: number; submitted_at?: string }>>([])

  // Build current pair vector (use API values if available, else computed fallbacks)
  const currentVector = useMemo(() => {
    const s = typeof pair?.synergy_score === 'number' ? pair!.synergy_score : computedSynergy
    const l = typeof pair?.lifestyle_compatibility_score === 'number' ? pair!.lifestyle_compatibility_score : 0
    const h = typeof pair?.humor_open_score === 'number' ? pair!.humor_open_score : hbForSummary.total
    const c = typeof pair?.communication_compatibility_score === 'number' ? pair!.communication_compatibility_score : 0
    const cv = typeof pair?.core_values_compatibility_score === 'number' ? pair!.core_values_compatibility_score : (scores.coreValues ? (scores.coreValues as number) : 0)
    const v = typeof pair?.vibe_compatibility_score === 'number' ? pair!.vibe_compatibility_score : 0
    return {
      synergy: Number(s) || 0,           // 0..35
      lifestyle: Number(l) || 0,         // 0..15
      humor_open: Number(h) || 0,        // 0..15
      communication: Number(c) || 0,     // 0..10
      core_values: Number(cv) || 0,      // 0..20
      vibe: Number(v) || 0               // 0..20
    }
  }, [pair, computedSynergy, hbForSummary.total, scores.coreValues])

  const dimMax = { synergy: 35, lifestyle: 15, humor_open: 15, communication: 10, core_values: 20, vibe: 20 }

  const computeSimilarityPct = (aVec: any, bVec: any) => {
    const keys = Object.keys(dimMax) as Array<keyof typeof dimMax>
    let acc = 0
    let count = 0
    keys.forEach(k => {
      const max = dimMax[k]
      const va = Math.max(0, Math.min(max, Number(aVec?.[k] ?? 0)))
      const vb = Math.max(0, Math.min(max, Number(bVec?.[k] ?? 0)))
      const diff = Math.abs(va - vb) / max
      acc += (1 - diff)
      count += 1
    })
    const mean = count > 0 ? acc / count : 0
    return Math.round(mean * 100)
  }

  const ensureAllMatches = async () => {
    if (allMatchesCache) return allMatchesCache
    try {
      const res = await fetch('/api/admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-all-matches' })
      })
      const data = await res.json()
      if (data?.success && Array.isArray(data.matches)) {
        setAllMatchesCache(data.matches)
        return data.matches
      }
    } catch (e) { /* ignore */ }
    setAllMatchesCache([])
    return []
  }

  const findMatchVector = (matches: any[], pNum1: number, pNum2: number, eventId?: number | null) => {
    const hit = matches.find(m => {
      const a = m.participant_a?.number
      const b = m.participant_b?.number
      const samePair = (a === pNum1 && b === pNum2) || (a === pNum2 && b === pNum1)
      const ev = m.round // matrix uses round as event_id
      return samePair && (eventId ? ev === eventId : true)
    })
    if (!hit) return { vec: null, feedback: null, comp: null }
    const ds = hit?.detailed_scores || {}
    const vec = {
      synergy: Number(ds.synergy ?? 0),
      lifestyle: Number(ds.lifestyle ?? 0),
      humor_open: Number(ds.humor_open ?? 0),
      communication: Number(ds.communication ?? 0),
      core_values: Number(ds.core_values ?? 0),
      vibe: Number(ds.vibe ?? 0),
    }
    // Average feedback compatibility if present
    const fA = hit?.feedback?.participant_a?.compatibility_rate
    const fB = hit?.feedback?.participant_b?.compatibility_rate
    let feedbackPct: number | null = null
    if (typeof fA === 'number' && typeof fB === 'number') feedbackPct = Math.round((fA + fB) / 2)
    else if (typeof fA === 'number') feedbackPct = fA
    else if (typeof fB === 'number') feedbackPct = fB
    const compPct = Number(hit?.compatibility_score ?? 0)
    return { vec, feedback: feedbackPct, comp: compPct }
  }

  // Collect organizer impressions (all feedback snippets) for a specific participant number
  const collectOrganizerImpressions = (matches: any[], personNum: number) => {
    const seen = new Set<string>()
    const items: Array<{ text: string; eventId?: number; partner?: number; submitted_at?: string }> = []
    const target = Number(personNum)
    for (const m of matches || []) {
      const aNum = Number(m?.participant_a?.number)
      const bNum = Number(m?.participant_b?.number)
      const evNum = Number(m?.round)
      let fb: any = null
      let partner: number | undefined = undefined
      if (!isNaN(aNum) && aNum === target) { fb = m?.feedback?.participant_a; partner = bNum }
      else if (!isNaN(bNum) && bNum === target) { fb = m?.feedback?.participant_b; partner = aNum }
      const txt = fb?.organizer_impression
      if (txt && String(txt).trim() !== '') {
        const key = `${!isNaN(evNum) ? evNum : ''}-${partner ?? ''}-${String(txt).trim()}`
        if (!seen.has(key)) {
          seen.add(key)
          items.push({ text: String(txt), eventId: !isNaN(evNum) ? evNum : undefined, partner, submitted_at: fb?.submitted_at || undefined })
        }
      }
    }
    items.sort((x, y) => {
      const dx = x.submitted_at ? new Date(x.submitted_at).getTime() : 0
      const dy = y.submitted_at ? new Date(y.submitted_at).getTime() : 0
      if (dx !== dy) return dy - dx
      return (y.eventId || 0) - (x.eventId || 0)
    })
    return items
  }

  // Load organizer impressions for both participants (fresh fetch on open to include all events)
  useEffect(() => {
    if (!open) return
    const load = async () => {
      // Clear cache so we always include cross-event pairs after any backend changes
      setAllMatchesCache(null)
      const matches = await ensureAllMatches()
      if (aNumber) setOrgImpressionsA(collectOrganizerImpressions(matches || [], aNumber))
      else setOrgImpressionsA([])
      if (bNumber) setOrgImpressionsB(collectOrganizerImpressions(matches || [], bNumber))
      else setOrgImpressionsB([])
    }
    load()
  }, [open, aNumber, bNumber])

  const onClickPrevChip = async (who: 'A' | 'B', partnerNum: number, eventId?: number | null) => {
    if (!currentVector || (!aNumber && who === 'A') || (!bNumber && who === 'B')) return
    const key = `${partnerNum}:${eventId ?? 'any'}`
    setLoadingPrevKey(key)
    const matches = await ensureAllMatches()
    const selfNum = who === 'A' ? aNumber : bNumber
    const { vec, feedback, comp } = findMatchVector(matches, selfNum, partnerNum, eventId ?? null)
    if (vec) {
      const sim = computeSimilarityPct(currentVector, vec)
      if (who === 'A') setPrevMetaA(prev => ({ ...prev, [key]: { similarity: sim, feedback, compatibility: comp, vec } }))
      else setPrevMetaB(prev => ({ ...prev, [key]: { similarity: sim, feedback, compatibility: comp, vec } }))
    } else {
      if (who === 'A') setPrevMetaA(prev => ({ ...prev, [key]: { similarity: undefined, feedback: null, compatibility: null } }))
      else setPrevMetaB(prev => ({ ...prev, [key]: { similarity: undefined, feedback: null, compatibility: null } }))
    }
    setLoadingPrevKey(null)
  }

  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      const agesLine = `الأعمار: ${aAgeLabel != null ? aAgeLabel : '—'} و ${bAgeLabel != null ? bAgeLabel : '—'}${ageDiff !== null ? ` (فارق ${ageDiff})` : ''}`
      const gendersLine = `النوع: ${mapGenderLabel(a)} و ${mapGenderLabel(b)}`
      const main = `التفاعل: ${scores.synergy.toFixed(1)}/35، الطاقة: ${scores.vibe.toFixed(1)}/20، نمط الحياة: ${scores.lifestyle.toFixed(1)}/15، الدعابة/الانفتاح: ${scores.humor.toFixed(1)}/15، التواصل: ${scores.communication.toFixed(1)}/10، القيم: ${scores.coreValues.toFixed(1)}/20، الأهداف: ${coreValues5 .toFixed(1)}/5`
      const text = `${agesLine}\n${gendersLine}\n${main}`
      await navigator.clipboard.writeText(text)
      setCopied(true); setTimeout(() => setCopied(false), 1200)
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] overflow-y-auto p-0 bg-[#0B0E14] border-white/10 text-white" dir="rtl">
        {/* Header */}
        <div className="flex flex-col gap-4 px-6 py-5 border-b border-white/10 bg-gradient-to-l from-cyan-950/50 via-slate-900 to-fuchsia-950/40">
          <div className="flex items-center justify-between gap-6">
            <DialogHeader>
              <DialogTitle className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-cyan-400" /> تحليل التوافق والتأثيرات التفصيلية
              </DialogTitle>
            </DialogHeader>
            <div className="shrink-0 hidden md:flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs text-slate-300">التصنيف</div>
                <div className="text-lg font-bold text-white">{tierName}</div>
              </div>
              <CircularProgressBar progress={overallPercent} size={132} strokeWidth={12} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/5 border border-white/15">
                <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-xs">{getInitial(aNameLabel)}</span>
                <span className="font-mono text-white">#{aNumber ?? '—'}</span>
                <span className="text-slate-200 font-medium">{aNameLabel}</span>
                {aMBTI && <span className="text-cyan-300">{String(aMBTI)}</span>}
                {aAgeLabel != null && <span className="text-slate-500">•</span>}
                {aAgeLabel != null && <span className="text-slate-300">العمر: {String(aAgeLabel)}</span>}
              </span>
              <span className="text-slate-500">↔</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/5 border border-white/15">
                <span className="w-6 h-6 rounded-full bg-fuchsia-500/20 text-fuchsia-300 flex items-center justify-center font-bold text-xs">{getInitial(bNameLabel)}</span>
                <span className="font-mono text-white">#{bNumber ?? '—'}</span>
                <span className="text-slate-200 font-medium">{bNameLabel}</span>
                {bMBTI && <span className="text-cyan-300">{String(bMBTI)}</span>}
                {bAgeLabel != null && <span className="text-slate-500">•</span>}
                {bAgeLabel != null && <span className="text-slate-300">العمر: {String(bAgeLabel)}</span>}
              </span>
            </div>
            <button onClick={handleCopy} className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 border border-white/15 text-slate-200 transition">
              <Copy className="w-3.5 h-3.5" /> {copied ? 'تم النسخ' : 'نسخ الملخص'}
            </button>
          </div>
          {/* Removed 'السبب' section per request */}
          {/* Organizer impressions (top, for each person) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Info className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-slate-300">انطباعات المنظّم — {aNameLabel}</span>
                <span className="ml-auto text-[10px] text-slate-400">{orgImpressionsA.length}</span>
              </div>
              {orgImpressionsA.length === 0 ? (
                <div className="text-[11px] text-slate-400">لا توجد انطباعات</div>
              ) : (
                <ul className="space-y-1 max-h-24 overflow-y-auto pr-1">
                  {orgImpressionsA.map((it, idx) => (
                    <li key={idx} className="text-[11px] text-slate-200 flex items-start gap-2">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-cyan-400/80"></span>
                      <span className="flex-1">
                        {it.text}
                        <span className="ml-2 text-[10px] text-slate-400">
                          {typeof it.eventId === 'number' ? `E${it.eventId}` : ''}{it.partner ? ` • #${it.partner}` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Info className="w-4 h-4 text-fuchsia-400" />
                <span className="text-xs text-slate-300">انطباعات المنظّم — {bNameLabel}</span>
                <span className="ml-auto text-[10px] text-slate-400">{orgImpressionsB.length}</span>
              </div>
              {orgImpressionsB.length === 0 ? (
                <div className="text-[11px] text-slate-400">لا توجد انطباعات</div>
              ) : (
                <ul className="space-y-1 max-h-24 overflow-y-auto pr-1">
                  {orgImpressionsB.map((it, idx) => (
                    <li key={idx} className="text-[11px] text-slate-200 flex items-start gap-2">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-fuchsia-400/80"></span>
                      <span className="flex-1">
                        {it.text}
                        <span className="ml-2 text-[10px] text-slate-400">
                          {typeof it.eventId === 'number' ? `E${it.eventId}` : ''}{it.partner ? ` • #${it.partner}` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
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
              {hasAi && (
                <TabsTrigger value="ai" className="text-slate-300 data-[state=active]:text-white data-[state=active]:bg-white/10">تحليل AI</TabsTrigger>
              )}
            </TabsList>

            {/* Summary */}
            <TabsContent value="summary">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-3">
                <div className="bg-gradient-to-br from-cyan-500/10 via-slate-900/50 to-fuchsia-500/10 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-3xl">
                  <div className="hidden md:flex items-center justify-center mb-3">
                    <CircularProgressBar progress={overallPercent} size={148} strokeWidth={12} />
                  </div>
                  <div className="md:hidden flex items-center justify-between">
                    <div>
                      <div className="text-slate-300 text-xs">التوافق الإجمالي</div>
                      <div className="text-3xl font-extrabold text-white">{overallPercent}%</div>
                    </div>
                    <CircularProgressBar progress={overallPercent} size={90} strokeWidth={10} />
                  </div>
                  {unbonusedPercent !== null && (
                    <div className="mt-1 text-[11px] text-slate-400 text-center md:text-right">(بدون مكافآت: {unbonusedPercent}%)</div>
                  )}
                  <div className="mt-4 space-y-3">
                    <ScoreBar label="التفاعل" icon={<Users className="w-3.5 h-3.5 text-cyan-400" />} value={scores.synergy} max={35} color="bg-cyan-500" />
                    <ScoreBar label="الطاقة" icon={<Sparkles className="w-3.5 h-3.5 text-violet-400" />} value={scores.vibe} max={20} color="bg-violet-500" />
                    <ScoreBar label="نمط الحياة" icon={<Home className="w-3.5 h-3.5 text-emerald-400" />} value={scores.lifestyle} max={15} color="bg-emerald-500" />
                    <ScoreBar label="الدعابة/الانفتاح" icon={<Sparkles className="w-3.5 h-3.5 text-amber-300" />} value={scores.humor} max={15} color="bg-amber-500" />
                    <ScoreBar label="التواصل" icon={<MessageCircle className="w-3.5 h-3.5 text-indigo-300" />} value={scores.communication} max={10} color="bg-indigo-500" />
                    <ScoreBar label="القيم/الأهداف" icon={<Star className="w-3.5 h-3.5 text-pink-300" />} value={coreValues5} max={5} color="bg-pink-500" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-fuchsia-500/10 via-slate-900/50 to-cyan-500/10 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-3xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-slate-300 text-xs">الملف التعريفي السريع</div>
                      {humorApplied && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-200 text-xs">
                          <Sparkles className="w-3.5 h-3.5" /> مكافأة الدعابة ×{humorMultiplier.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-200">
                      <div className="space-y-1">
                        <div><span className="text-slate-300">{aNameLabel} - العمر:</span> {aAgeLabel != null ? String(aAgeLabel) : '—'}</div>
                        <div><span className="text-slate-300">{aNameLabel} - الجنس:</span> {mapGenderLabel(a)}</div>
                      </div>
                      <div className="space-y-1">
                        <div><span className="text-slate-300">{bNameLabel} - العمر:</span> {bAgeLabel != null ? String(bAgeLabel) : '—'}</div>
                        <div><span className="text-slate-300">{bNameLabel} - الجنس:</span> {mapGenderLabel(b)}</div>
                      </div>
                      <div className="md:col-span-2 text-slate-300">
                        فارق العمر: <span className="text-white font-semibold">{ageDiff !== null ? `${ageDiff}` : '—'}</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-slate-300 text-xs mb-2 flex items-center gap-2">
                        <span>القيود والمكافآت</span>
                        {pair?.reason && String(pair.reason).includes('±1y') && (
                          <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-400/30" title="تم قبول خارج تفضيل العمر ضمن تسامح ±1 سنة">
                            <span className="text-yellow-300 text-[10px] font-bold">±1</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs md:text-sm">
                        {pair?.humor_early_openness_bonus && pair.humor_early_openness_bonus !== 'none' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-200" title="تطابق أسلوب الدعابة يمنح مضاعفًا ×1.05 للنتيجة">
                            <Sparkles className="w-4 h-4" /> مكافأة أسلوب الدعابة ×1.05
                          </span>
                        )}
                        {pair?.intent_boost_applied && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-200" title="تطابق الأهداف يمنح مضاعفًا ×1.05">
                            <BadgeCheck className="w-4 h-4" /> مضاعف الأهداف ×1.05
                          </span>
                        )}
                        {pair?.attachment_penalty_applied && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-red-400/40 bg-red-500/10 text-red-200" title="قلق × تجنّب ⇒ −5 قبل تطبيق القيود">
                            <Shield className="w-4 h-4" /> عقوبة التعلق −5
                          </span>
                        )}
                        {pair?.dead_air_veto_applied && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-red-400/40 bg-red-500/10 text-red-200" title="كلاهما دور C وراحة الصمت B ⇒ سقف 40%">
                            <Info className="w-4 h-4" /> قيد الصمت: سقف 40%
                          </span>
                        )}
                        {pair?.humor_clash_veto_applied && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-red-400/40 bg-red-500/10 text-red-200" title="تعارض قوي في الدعابة (A↔D) ⇒ سقف 50%">
                            <Info className="w-4 h-4" /> تعارض الدعابة: سقف 50%
                          </span>
                        )}
                        {pair?.cap_applied != null && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-yellow-400/40 bg-yellow-500/10 text-yellow-200" title="تم تطبيق سقف نهائي على النتيجة">
                            <Zap className="w-4 h-4" /> تقييد نهائي: {pair.cap_applied}%
                          </span>
                        )}
                        {!pair?.intent_boost_applied && !pair?.attachment_penalty_applied && !pair?.dead_air_veto_applied && !pair?.humor_clash_veto_applied && !pair?.cap_applied && (!pair?.humor_early_openness_bonus || pair.humor_early_openness_bonus === 'none') && (
                          <span className="text-slate-300">لا توجد قيود/مكافآت خاصة</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-cyan-500/10 via-slate-900/50 to-fuchsia-500/10 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-3xl">
                    <div className="text-slate-300 text-xs mb-2">الطاقة والشخصية</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-slate-200">
                        <thead className="text-slate-300/90">
                          <tr>
                            <th className="text-right py-2 pr-2 font-semibold">المحور</th>
                            <th className="text-center py-2">{aNameLabel}</th>
                            <th className="text-center py-2">{bNameLabel}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          <tr>
                            <td className="py-2 pr-2">نهاية الأسبوع</td>
                            <td className="py-2 text-center">{aAns?.vibe_1 ? String(aAns.vibe_1) : '—'}</td>
                            <td className="py-2 text-center">{bAns?.vibe_1 ? String(bAns.vibe_1) : '—'}</td>
                          </tr>
                          <tr>
                            <td className="py-2 pr-2">الهوايات</td>
                            <td className="py-2 text-center">{aAns?.vibe_2 ? String(aAns.vibe_2) : '—'}</td>
                            <td className="py-2 text-center">{bAns?.vibe_2 ? String(bAns.vibe_2) : '—'}</td>
                          </tr>
                          <tr>
                            <td className="py-2 pr-2">الموسيقى</td>
                            <td className="py-2 text-center">{aAns?.vibe_3 ? String(aAns.vibe_3) : '—'}</td>
                            <td className="py-2 text-center">{bAns?.vibe_3 ? String(bAns.vibe_3) : '—'}</td>
                          </tr>
                          <tr>
                            <td className="py-2 pr-2">كيف يصفك الأصدقاء</td>
                            <td className="py-2 text-center">{aAns?.vibe_5 ? String(aAns.vibe_5) : '—'}</td>
                            <td className="py-2 text-center">{bAns?.vibe_5 ? String(bAns.vibe_5) : '—'}</td>
                          </tr>
                          <tr>
                            <td className="py-2 pr-2">كيف تصف أصدقاءك</td>
                            <td className="py-2 text-center">{aAns?.vibe_6 ? String(aAns.vibe_6) : '—'}</td>
                            <td className="py-2 text-center">{bAns?.vibe_6 ? String(bAns.vibe_6) : '—'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-fuchsia-500/10 via-slate-900/50 to-cyan-500/10 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-3xl">
                  <div className="text-slate-300 text-xs mb-2">التفضيلات</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-slate-200">
                      <thead className="text-slate-300/90">
                        <tr>
                          <th className="text-right py-2 pr-2 font-semibold">فئة التفضيل</th>
                          <th className="text-center py-2">{aNameLabel}</th>
                          <th className="text-center py-2">{bNameLabel}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        <tr>
                          <td className="py-2 pr-2">الجنس المفضل {genderPrefAlign && (<CheckCircle className="inline w-3.5 h-3.5 text-emerald-400 mr-1" />)}</td>
                          <td className="py-2 text-center">{aGenderPref}</td>
                          <td className="py-2 text-center">{bGenderPref}</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-2">الفئة العمرية {agePrefAlign && (<CheckCircle className="inline w-3.5 h-3.5 text-emerald-400 mr-1" />)}</td>
                          <td className="py-2 text-center">{aAgePref}</td>
                          <td className="py-2 text-center">{bAgePref}</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-2">الجنسية {nationalityAlign && (<CheckCircle className="inline w-3.5 h-3.5 text-emerald-400 mr-1" />)}</td>
                          <td className="py-2 text-center">{aNationality}</td>
                          <td className="py-2 text-center">{bNationality}</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-2">تفضيل الجنسية</td>
                          <td className="py-2 text-center">{mapNationalityPref(a)}</td>
                          <td className="py-2 text-center">{mapNationalityPref(b)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Previous matches list (beneath preferences) */}
                  {(historyA.length > 0 || historyB.length > 0) && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* A history */}
                      {historyA.length > 0 && (
                        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-slate-300 text-xs">مطابقات سابقة — {aNameLabel}</div>
                            <span className="text-[10px] text-slate-500">E{currentEventId}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {historyA.map((m, idx) => {
                              const k = `${m.partner_number}:${m.event_id ?? 'any'}`
                              const meta = prevMetaA[k]
                              return (
                                <button
                                  type="button"
                                  key={idx}
                                  onClick={() => onClickPrevChip('A', m.partner_number, m.event_id ?? null)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition"
                                  title="عرض التشابه والتقييم"
                                >
                                  <span className="text-cyan-300 font-mono">#{m.partner_number}</span>
                                  {m.partner_name && <span className="text-slate-300 truncate max-w-[120px]">{m.partner_name}</span>}
                                  {typeof m.event_id === 'number' && (
                                    <span className={`text-[10px] ${m.event_id === currentEventId ? 'text-emerald-300' : 'text-purple-300'}`}>E{m.event_id}</span>
                                  )}
                                  {loadingPrevKey === k && <span className="text-[10px] text-slate-400">…</span>}
                                  {meta?.similarity !== undefined && (
                                    <span className="text-[10px] text-emerald-300">≈{meta.similarity}%</span>
                                  )}
                                  {typeof meta?.feedback === 'number' && (
                                    <span className="text-[10px] text-blue-300">{meta.feedback}%</span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* B history */}
                      {historyB.length > 0 && (
                        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-slate-300 text-xs">مطابقات سابقة — {bNameLabel}</div>
                            <span className="text-[10px] text-slate-500">E{currentEventId}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {historyB.map((m, idx) => {
                              const k = `${m.partner_number}:${m.event_id ?? 'any'}`
                              const meta = prevMetaB[k]
                              return (
                                <button
                                  type="button"
                                  key={idx}
                                  onClick={() => onClickPrevChip('B', m.partner_number, m.event_id ?? null)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition"
                                  title="عرض التشابه والتقييم"
                                >
                                  <span className="text-cyan-300 font-mono">#{m.partner_number}</span>
                                  {m.partner_name && <span className="text-slate-300 truncate max-w-[120px]">{m.partner_name}</span>}
                                  {typeof m.event_id === 'number' && (
                                    <span className={`text-[10px] ${m.event_id === currentEventId ? 'text-emerald-300' : 'text-purple-300'}`}>E{m.event_id}</span>
                                  )}
                                  {loadingPrevKey === k && <span className="text-[10px] text-slate-400">…</span>}
                                  {meta?.similarity !== undefined && (
                                    <span className="text-[10px] text-emerald-300">≈{meta.similarity}%</span>
                                  )}
                                  {typeof meta?.feedback === 'number' && (
                                    <span className="text-[10px] text-blue-300">{meta.feedback}%</span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}:  {(SYNERGY_OPTIONS[key] || {})[String(aAns[key] || '').toUpperCase()] || String(aAns[key] || '—')}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}:  {(SYNERGY_OPTIONS[key] || {})[String(bAns[key] || '').toUpperCase()] || String(bAns[key] || '—')}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="text-slate-300 text-xs mb-2">تفصيل النقاط المحسوبة</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {synergyDetails.map(item => (
                      <div key={item.key} className={`bg-slate-900/70 border rounded-lg p-3 ${item.raw > 0 ? 'border-green-400/30' : 'border-white/20'}`}>
                        <div className="text-slate-300 mb-1">{item.label}</div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 mb-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}: {(SYNERGY_OPTIONS[item.key] || {})[item.aVal] || item.aVal || '—'}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}: {(SYNERGY_OPTIONS[item.key] || {})[item.bVal] || item.bVal || '—'}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-500" style={{ width: `${Math.min(100, (item.raw / item.maxRaw) * 100)}%` }} />
                        </div>
                        <div className="mt-1 text-slate-200">+{(item.scaled).toFixed(2)} / {(item.maxRaw * (35/30)).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                  {(() => { const top = computeTopSynergyDrivers(synergyDetails); if (!top.length) return null; return (
                    <div className="mt-3 text-xs">
                      <div className="text-slate-300 mb-1">أهم العوامل الإيجابية</div>
                      <div className="flex flex-wrap gap-2">
                        {top.map((t, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-200">+{t.scaled.toFixed(2)} — {t.label}</span>
                        ))}
                      </div>
                    </div>
                  ) })()}
                </div>
              </div>
            </TabsContent>

            {/* Lifestyle */}
            <TabsContent value="lifestyle">
              <div className="bg-white/10 border border-white/20 rounded-xl p-4 mt-3">
                <div className="text-slate-200 font-semibold mb-1">نمط الحياة — {scores.lifestyle.toFixed(1)} / 15</div>
                <div className="text-slate-400 text-xs mb-3">تفصيل الأسئلة (لكل سؤال حتى 3 نقاط)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {lifestyleDetails.items.map((row) => (
                    <div key={row.idx} className="bg-slate-900/70 border border-white/20 rounded-lg p-3">
                      <div className="text-slate-300 mb-1">{row.label}</div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 mb-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}:  {LIFESTYLE_OPTIONS[row.idx]?.[String(row.aVal || '')] || String(row.aVal || '—')}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}:  {LIFESTYLE_OPTIONS[row.idx]?.[String(row.bVal || '')] || String(row.bVal || '—')}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (row.points / row.max) * 100)}%` }} />
                      </div>
                      <div className="mt-1 text-slate-200">+{row.points} / {row.max}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {lifestyleDetails.bonus > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 text-cyan-200">+{lifestyleDetails.bonus} مكافأة سياق مشترك (س14 وس18)</span>
                  )}
                  {lifestyleDetails.penalty < 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-red-400/40 bg-red-500/10 text-red-200">{lifestyleDetails.penalty} تعارض (س18: أ مقابل ج)</span>
                  )}
                  <span className="ml-auto text-slate-300">الإجمالي: <span className="text-white font-semibold">{lifestyleDetails.computed}</span> / 15</span>
                </div>
              </div>
            </TabsContent>

            {/* Communication */}
            <TabsContent value="communication">
              <div className="bg-white/10 border border-white/20 rounded-xl p-4 mt-3">
                <div className="text-slate-200 font-semibold mb-1">التواصل — {scores.communication.toFixed(1)} / 10</div>
                <div className="text-slate-400 text-xs mb-3">يعرض اختيارات الأسئلة، والحساب يتم على نمط التواصل النهائي</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {['communication_1','communication_2','communication_3','communication_4','communication_5'].map((k) => {
                    const meta = COMMUNICATION_QUESTIONS[k]
                    const aVal = String(aAns[k] || '')
                    const bVal = String(bAns[k] || '')
                    const same = aVal && bVal && aVal === bVal
                    return (
                      <div key={k} className={`bg-slate-900/70 border rounded-lg p-3 ${same ? 'border-green-400/30' : 'border-white/20'}`}>
                        <div className="text-slate-300 mb-1">{meta?.label || k}</div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}:  {meta?.options?.[aVal] || aVal || '—'}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}:  {meta?.options?.[bVal] || bVal || '—'}</span>
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
                <div className="text-slate-200 font-semibold mb-1">القيم الأساسية — {(scores.coreValues).toFixed(1)} / 20</div>
                <div className="text-slate-400 text-xs mb-3">تفصيل الأسئلة (لكل سؤال حتى 4 نقاط)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {coreValuesDetails.items.map((row) => {
                    const meta = CORE_VALUES_QUESTIONS[row.key]
                    return (
                      <div key={row.key} className={`bg-slate-900/70 border rounded-lg p-3 ${row.points === row.max ? 'border-green-400/30' : 'border-white/20'}`}>
                        <div className="text-slate-300 mb-1">{meta?.label || row.key}</div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 mb-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}:  {meta?.options?.[row.aVal] || row.aVal || '—'}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}:  {meta?.options?.[row.bVal] || row.bVal || '—'}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-pink-500" style={{ width: `${Math.min(100, (row.points / row.max) * 100)}%` }} />
                        </div>
                        <div className="mt-1 text-slate-200">+{row.points} / {row.max}</div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-300">الإجمالي: <span className="text-white font-semibold">{coreValuesDetails.total}</span> / 20</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mt-4">
                  <div className="bg-slate-900/70 border border-white/20 rounded-lg p-3">
                    <div className="text-slate-300 mb-1">الهدف من الحضور (حتى 5 نقاط)</div>
                    {(() => { const getAns = (p: any, key: string) => p?.survey_data?.answers?.[key] ?? p?.[key] ?? ''; const a40 = String(getAns(a, 'intent_goal') || '').toUpperCase(); const b40 = String(getAns(b, 'intent_goal') || '').toUpperCase(); let score = 0; if (!a40 || !b40) score = 0; else if ((a40 === 'A' && b40 === 'A') || (a40 === 'B' && b40 === 'B')) score = 5; else if (a40 === 'C' && b40 === 'C') score = 3; else if ((a40 === 'A' && b40 === 'B') || (a40 === 'B' && b40 === 'A')) score = 1; else if ((a40 === 'A' && b40 === 'C') || (a40 === 'C' && b40 === 'A')) score = 3; else if ((a40 === 'B' && b40 === 'C') || (a40 === 'C' && b40 === 'B')) score = 1; return (
                      <>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}:  {a40 ? (INTENT_GOAL_OPTIONS[a40] || a40) : '—'}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}:  {b40 ? (INTENT_GOAL_OPTIONS[b40] || b40) : '—'}</span>
                        </div>
                        <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${(Math.min(5, Math.max(0, score)) / 5) * 100}%` }} />
                        </div>
                        <div className="mt-2 text-slate-300">النقاط المحسوبة: <span className="text-emerald-300 font-semibold">{score}</span> / 5</div>
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
                <div className="text-slate-200 font-semibold mb-3">الدعابة والانفتاح المبكر (حتى 15 نقطة) — {scores.humor.toFixed(1)} / 15</div>
                <div className="mb-3 text-xs">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${humorMultiplier > 1 ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30' : 'bg-white/5 text-slate-300 border-white/20'}`} title="مضاعف مختلط من تطابق الدعابة والانفتاح">مضاعف: ×{humorMultiplier.toFixed(2)}</span>
                </div>
                {hbForSummary?.vetoClash && (
                  <div className="mb-3 text-xs inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-red-400/40 bg-red-500/10 text-red-200">
                    <Info className="w-4 h-4" /> تعارض دعابة قوي (A↔D): تم تفعيل قيد السقف
                  </div>
                )}
                {(() => { const hb = computeHumorOpenBreakdown(a, b); return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-900/70 border border-white/20 rounded-lg p-3">
                      <div className="text-slate-300 mb-1">أسلوب الدعابة/المزاح</div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}:  {hb.hA ? (HUMOR_BANTER_OPTIONS[hb.hA] || hb.hA) : '—'}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}:  {hb.hB ? (HUMOR_BANTER_OPTIONS[hb.hB] || hb.hB) : '—'}</span>
                      </div>
                      <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, (hb.humorScore / 10) * 100)}%` }} />
                      </div>
                      <div className="mt-2 text-slate-300">نقاط الدعابة: <span className="text-amber-300 font-semibold">{hb.humorScore}</span> / 10 {hb.vetoClash ? '— تعارض قوي (A↔D)' : ''}</div>
                    </div>
                    <div className="bg-slate-900/70 border border-white/20 rounded-lg p-3">
                      <div className="text-slate-300 mb-1">الراحة مع الانفتاح المبكر</div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}:  {(hb.oA !== undefined && hb.oA !== null) ? (EARLY_OPENNESS_LABELS[hb.oA] || String(hb.oA)) : '—'}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}:  {(hb.oB !== undefined && hb.oB !== null) ? (EARLY_OPENNESS_LABELS[hb.oB] || String(hb.oB)) : '—'}</span>
                      </div>
                      <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, (hb.openScore / 5) * 100)}%` }} />
                      </div>
                      <div className="mt-2 text-slate-300">نقاط الانفتاح: <span className="text-amber-300 font-semibold">{hb.openScore}</span> / 5</div>
                    </div>
                  </div>
                ) })()}
              </div>
            </TabsContent>

            {/* MBTI */}
            <TabsContent value="mbti">
              <div className="bg-white/10 border border-white/20 rounded-xl p-4 mt-3">
                <div className="text-slate-200 font-semibold mb-1">MBTI (توضيحي فقط)</div>
                <div className="text-slate-400 text-xs mb-3">لا يُحسب كنقاط مباشرة، لكنه قد يؤثر على التوافق العام</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {['mbti_1','mbti_2','mbti_3','mbti_4'].map((k) => { const meta = MBTI_QUESTIONS[k]; const aVal = String(aAns[k] || ''); const bVal = String(bAns[k] || ''); const same = aVal && bVal && aVal === bVal; return (
                    <div key={k} className={`bg-slate-900/70 border rounded-lg p-3 ${same ? 'border-green-400/30' : 'border-white/20'}`}>
                      <div className="text-slate-300 mb-1">{meta?.label || k}</div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-400/30">{aNameLabel}:  {meta?.options?.[aVal] || aVal || '—'}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-400/30">{bNameLabel}:  {meta?.options?.[bVal] || bVal || '—'}</span>
                      </div>
                    </div>
                  ) })}
                </div>
              </div>
            </TabsContent>

            {/* AI Analysis (if available) */}
            {hasAi && (
              <TabsContent value="ai">
                <div className="bg-white/10 border border-white/20 rounded-xl p-4 mt-3">
                  <div className="text-slate-200 font-semibold mb-3">تحليل الشخصية بالذكاء الاصطناعي</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="bg-slate-900/70 border border-white/20 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-slate-300">{aNameLabel}</div>
                        {aAI && (
                          <button onClick={async () => { try { await navigator.clipboard.writeText(aAI); } catch {} }} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/15 text-slate-200 text-xs"><Copy className="w-3.5 h-3.5" /> نسخ</button>
                        )}
                      </div>
                      <p className="text-slate-200 whitespace-pre-line">{aAI || '— لا يوجد تحليل محفوظ'}</p>
                    </div>
                    <div className="bg-slate-900/70 border border-white/20 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-slate-300">{bNameLabel}</div>
                        {bAI && (
                          <button onClick={async () => { try { await navigator.clipboard.writeText(bAI); } catch {} }} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/15 text-slate-200 text-xs"><Copy className="w-3.5 h-3.5" /> نسخ</button>
                        )}
                      </div>
                      <p className="text-slate-200 whitespace-pre-line">{bAI || '— لا يوجد تحليل محفوظ'}</p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>

          {/* Action bar */}
          <div className="mt-6 border-t border-white/10 pt-4 flex items-center justify-end gap-2">
            <button onClick={handleCopy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/15 text-slate-200 text-sm"><Copy className="w-4 h-4" /> نسخ الملخص</button>
            <button onClick={async () => { try {
              const lines: string[] = []
              lines.push(`التوافق الإجمالي: ${overallPercent}%`)
              if (pair?.reason) lines.push(`السبب: ${pair.reason}`)
              lines.push(`الأعمار: ${aAgeLabel != null ? aAgeLabel : '—'} و ${bAgeLabel != null ? bAgeLabel : '—'}${ageDiff !== null ? ` (فارق ${ageDiff})` : ''}`)
              lines.push(`النوع: ${mapGenderLabel(a)} و ${mapGenderLabel(b)}`)
              lines.push(`التفاعل: ${scores.synergy.toFixed(1)}/35`)
              lines.push(`الطاقة: ${scores.vibe.toFixed(1)}/20`)
              lines.push(`نمط الحياة: ${scores.lifestyle.toFixed(1)}/15`)
              lines.push(`الدعابة/الانفتاح: ${scores.humor.toFixed(1)}/15 (×${humorMultiplier.toFixed(2)})`)
              lines.push(`التواصل: ${scores.communication.toFixed(1)}/10`)
              lines.push(`القيم: ${scores.coreValues.toFixed(1)}/20`)
              lines.push(`الأهداف: ${coreValues5 .toFixed(1)}/5`)
              const top = computeTopSynergyDrivers(synergyDetails)
              if (top.length) lines.push(`أهم العوامل: ${top.map(t => `+${t.scaled.toFixed(2)} ${t.label}`).join('، ')}`)
              const flags: string[] = []
              if (pair?.humor_early_openness_bonus && pair.humor_early_openness_bonus !== 'none') flags.push(`مكافأة الدعابة/الانفتاح: ${pair.humor_early_openness_bonus}`)
              if (pair?.intent_boost_applied) flags.push('مضاعف الهدف')
              if (pair?.attachment_penalty_applied) flags.push('عقوبة التعلق')
              if (pair?.dead_air_veto_applied) flags.push('قيد الصمت')
              if (pair?.humor_clash_veto_applied) flags.push('تعارض الدعابة')
              if (pair?.cap_applied != null) flags.push(`تقييد نهائي: ${pair?.cap_applied}%`)
              if (flags.length) lines.push(`القيود/المكافآت: ${flags.join('، ')}`)
              await navigator.clipboard.writeText(lines.join('\n'))
            } catch {} }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-400/30 text-cyan-100 text-sm"><Copy className="w-4 h-4" /> نسخ التفصيل</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
