import { useState, useEffect } from "react"
import { useSearchParams, Link } from "react-router"
import { 
  ArrowLeft, 
  AlertTriangle, 
  Search, 
  Clock, 
  Heart, 
  X, 
  Handshake, 
  Home,
  User,
  Phone,
  Mail,
  RefreshCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Award,
  Users,
  Brain,
  Trophy
} from "lucide-react"
import { Button } from "../../components/ui/button"
import { isCurrentBalancedScoreRow, isCurrentOppositesScoreRow, parseScoreObject } from "~/lib/compatibility-model"

interface BalancedScoreBreakdown {
  semanticCommonGround?: number | null
  aiSemantic?: number | null
  sharedContext?: number | null
  interactionRhythm?: number | null
  humorOpenness?: number | null
  attachmentComfort?: number | null
  lifestyleSustainability?: number | null
  valuesBoundaries?: number | null
  valuesBoundariesLanguage?: number | null
  language?: number | null
  communicationDisagreement?: number | null
  intent?: number | null
  // Participant API aliases for balanced cache rows.
  synergy?: number | null
  vibe?: number | null
  lifestyle?: number | null
  humorOpen?: number | null
  communication?: number | null
  coreValues?: number | null
  total?: number | null
  interactionSynergy?: number | null
  coreValuesAlignment?: number | null
  communicationAlignment?: number | null
  lifestyleDifference?: number | null
  vibeDifference?: number | null
  humorDifference?: number | null
}

interface CompatibilityMetrics {
  newModel: boolean
  balancedModel: boolean
  synergyScore: number
  synergyMax: number
  synergyPercent: number
  sharedContext: number
  sharedContextMax: number
  vibe: number
  vibeMax: number
  lifestyle: number
  lifestyleMax: number
  humorOpen: number
  humorOpenMax: number
  communication: number
  communicationMax: number
  attachment: number
  attachmentMax: number
  valuesLanguage: number
  valuesLanguageMax: number
  intentValues: number
  intentMax: number
  oppositesModel?: boolean
  dimensions?: Array<{ label: string; value: number; max: number; bar: string }>
}

interface CompatibilityComponent {
  name: string
  strength: string
  color: string
  bgColor: string
  borderColor: string
  description: string
}

interface MatchResult {
  with: number | string
  partner_name?: string
  partner_age?: number | null
  partner_phone?: string | null
  partner_event_id?: number | null
  type: string
  reason: string
  round: number
  table_number?: number | null
  score: number | null
  is_repeat_match?: boolean
  mutual_match?: boolean
  wants_match?: boolean | null
  partner_wants_match?: boolean | null
  created_at?: string
  ai_personality_analysis?: string | null
  event_id?: number
  partner_message?: string | null
  humor_early_openness_bonus?: 'full' | 'partial' | 'none'
  my_feedback?: {
    compatibilityRate?: number | null
    conversationQuality?: number | null
    personalConnection?: number | null
    sharedInterests?: number | null
    comfortLevel?: number | null
    communicationStyle?: number | null
    wouldMeetAgain?: number | null
    overallExperience?: number | null
    recommendations?: string | null
    organizerImpression?: string | null
    submittedAt?: string | null
    wantConnect?: boolean | null
    sliderMoved?: boolean | null
  } | null
  partner_feedback?: {
    conversationQuality?: number | null
    personalConnection?: number | null
    overallExperience?: number | null
    wantConnect?: boolean | null
    compatibilityRate?: number | null
    sliderMoved?: boolean | null
    organizerImpression?: string | null
  } | null
  // New model numeric fields (optional, returned by API if available)
  synergy_score?: number | null
  humor_open_score?: number | null
  intent_score?: number | null
  communication_compatibility_score?: number | null
  lifestyle_compatibility_score?: number | null
  vibe_compatibility_score?: number | null
  core_values_compatibility_score?: number | null
  communication_disagreement_score?: number | null
  values_boundaries_score?: number | null
  language_score?: number | null
  shared_context_score?: number | null
  score_model_version?: string | null
  score_breakdown?: BalancedScoreBreakdown | null
  score_snapshot?: Record<string, unknown> | string | null
  // Event 3+ fields (choice vs algorithm)
  match_type?: 'choice' | 'algorithm' | 'third_choice' | null
  event_format?: 'classic' | 'choice_only_three_groups' | string | null
  match_label?: string | null
  match_word?: string | null
  breakdown?: BalancedScoreBreakdown | null
  match_preference?: string | null
}

interface ResultsData {
  assigned_number: number
  event_id: number
  event_format?: 'classic' | 'choice_only_three_groups' | string | null
  history: MatchResult[]
}

const CHOICE_ONLY_EVENT_FORMAT = 'choice_only_three_groups'

function isChoiceOnlyEventMatch(match: MatchResult | null | undefined) {
  return match?.event_format === CHOICE_ONLY_EVENT_FORMAT
}

function eventUsesChoiceOnlyFormat(items: Array<{ match: MatchResult }>) {
  return items.some(item => isChoiceOnlyEventMatch(item.match))
}

function event3MatchLabel(match: MatchResult, choiceOnly = isChoiceOnlyEventMatch(match)) {
  if (choiceOnly) {
    if (match.match_type === 'choice') return 'الاختيار الأول'
    if (match.match_type === 'algorithm') return 'الاختيار الثاني'
    return 'الاختيار الثالث'
  }
  if (match.match_label) return match.match_label
  return match.match_type === 'choice' ? 'اختيارك الشخصي' : 'اختيار الخوارزمية'
}

function matchPreferenceStyle(preference: string | null | undefined) {
  if (preference === 'choice' || preference === 'first') return { box: 'bg-pink-500/10 border-pink-500/20', text: 'text-pink-300' }
  if (preference === 'algorithm' || preference === 'second') return { box: 'bg-purple-500/10 border-purple-500/20', text: 'text-purple-300' }
  if (preference === 'third') return { box: 'bg-violet-500/10 border-violet-500/20', text: 'text-violet-300' }
  if (preference === 'both' || preference === 'multiple') return { box: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-300' }
  return { box: 'bg-gray-500/10 border-gray-500/20', text: 'text-gray-400' }
}

function matchPreferenceLabel(preference: string, choiceOnly: boolean) {
  if (choiceOnly) {
    if (preference === 'choice' || preference === 'first') return 'فضّلت الاختيار الأول'
    if (preference === 'algorithm' || preference === 'second') return 'فضّلت الاختيار الثاني'
    if (preference === 'third') return 'فضّلت الاختيار الثالث'
    if (preference === 'both' || preference === 'multiple') return 'فضّلت أكثر من لقاء'
    return 'لم تفضّل أي لقاء'
  }
  if (preference === 'choice') return 'اخترت اختيارك الشخصي'
  if (preference === 'algorithm') return 'اخترت اختيار الخوارزمية'
  if (preference === 'both') return 'كلاهما ممتاز'
  return 'لم تفضّل أيهما'
}

export default function ResultsPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resultsData, setResultsData] = useState<ResultsData | null>(null)
  const [dark] = useState(true) // Match the welcome page theme
  const [showAiAnalysis, setShowAiAnalysis] = useState<{[key: number]: boolean}>({})
  const [expandedMatches, setExpandedMatches] = useState<{[key: number]: boolean}>({})
  const [expandedEvents, setExpandedEvents] = useState<{[key: number]: boolean}>({})

  // Any event with id >= 20 is a BlindMatch 5.0 (event3) event
  // Also check match_type since event3 events can have any event_id
  const isEvent3 = (eventId: number) => eventId >= 20
  const isEvent3Match = (m: MatchResult) => (m.event_id ?? 0) >= 20 || m.match_type === 'choice' || m.match_type === 'algorithm' || m.match_type === 'third_choice'
  const groupIsEvent3 = (items: Array<{ match: MatchResult; matchIndex: number }>) => items.some(i => isEvent3Match(i.match))

  // Check if event3 choice and algorithm matched the same person — computed per event
  const e3SameMatchByEvent = (() => {
    const map: { [eventId: number]: boolean } = {}
    const history = resultsData?.history || []
    const eventIds = [...new Set(history.filter(m => isEvent3Match(m)).map(m => m.event_id as number))]
    for (const eid of eventIds) {
      const items = history.filter(m => m.event_id === eid && (m.match_type === 'choice' || m.match_type === 'algorithm'))
      if (items.some(isChoiceOnlyEventMatch) || (eid === resultsData?.event_id && resultsData?.event_format === CHOICE_ONLY_EVENT_FORMAT)) {
        map[eid] = false
        continue
      }
      const choice = items.find(m => m.match_type === 'choice')
      const algorithm = items.find(m => m.match_type === 'algorithm')
      map[eid] = !!(choice && algorithm && choice.with === algorithm.with)
    }
    return map
  })()

  const formatSessionCount = (count: number) => {
    const n = Math.max(0, Math.floor(Number(count) || 0))
    if (n === 1) return 'جلسة واحدة'
    if (n === 2) return 'جلستان'
    if (n >= 3 && n <= 10) return `${n} جلسات`
    return `${n} جلسة`
  }
  
  // Helper: show the final score exactly as stored (matches matrix)
  const getOriginalScore = (match: MatchResult): number => {
    const score = Number(match.score)
    return Number.isFinite(score) ? Math.round(score) : 0
  }

  // Function to convert technical compatibility reason to natural Arabic description
  // Enhanced to expose structured metrics for the new model (Synergy, Vibe, Lifestyle, Humor/Openness, Communication, Goals/Values)
  const formatLegacyCompatibilityReason = (reason: string): { components: Array<{ name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }>; originalReason: string; metrics: { newModel: boolean; synergyScore: number; synergyMax: number; synergyPercent: number; vibe: number; lifestyle: number; humorOpen: number; communication: number; intentValues: number } } => {
    try {
      if (!reason || typeof reason !== 'string') return { components: [], originalReason: "معلومات التوافق غير متوفرة", metrics: { newModel: false, synergyScore: 0, synergyMax: 35, synergyPercent: 0, vibe: 0, lifestyle: 0, humorOpen: 0, communication: 0, intentValues: 0 } }
      
      // Extract scores (OLD model keys)
      const mbtiMatch = reason.match(/MBTI:.*?\((\d+)%\)/)
      const attachmentMatch = reason.match(/التعلق:.*?\((\d+)%\)/)
      const communicationOldMatch = reason.match(/التواصل:.*?\((\d+)%\)/)
      const lifestyleOldMatch = reason.match(/نمط الحياة:.*?\((\d+)%\)/)
      const coreValuesMatch = reason.match(/القيم الأساسية:.*?\((\d+)%\)/)
      const vibeOldMatch = reason.match(/التوافق الشخصي:.*?\((\d+)%\)/)
      
      const mbtiScore = mbtiMatch ? parseInt(mbtiMatch[1]) || 0 : 0
      const attachmentScore = attachmentMatch ? parseInt(attachmentMatch[1]) || 0 : 0
      const communicationScore = communicationOldMatch ? parseInt(communicationOldMatch[1]) || 0 : 0
      const lifestyleScore = lifestyleOldMatch ? parseInt(lifestyleOldMatch[1]) || 0 : 0
      const coreValuesScore = coreValuesMatch ? parseInt(coreValuesMatch[1]) || 0 : 0
      const vibeScore = vibeOldMatch ? parseInt(vibeOldMatch[1]) || 0 : 0

      // Extract scores (NEW 100-pt model keys, support EN and AR labels)
      const synergyMatch = reason.match(/(?:Synergy|التفاعل):\s*(\d+)%/)
      const vibeNewMatch = reason.match(/(?:Vibe|الطاقة):\s*(\d+)%/)
      const lifestyleNewMatch = reason.match(/(?:Lifestyle|نمط الحياة):\s*(\d+)%/)
      const humorOpenMatch = reason.match(/(?:Humor\/Openness|الدعابة\/الانفتاح):\s*(\d+)%/)
      const communicationNewMatch = reason.match(/(?:Communication|التواصل):\s*(\d+)%/)
      const intentValuesMatch = reason.match(/(?:Intent|Goal&Values|Goals|الأهداف(?:\/القيم)?):\s*(\d+)%/)

      const synergyScore = synergyMatch ? parseInt(synergyMatch[1]) || 0 : 0 // max 30
      const vibeNewScore = vibeNewMatch ? parseInt(vibeNewMatch[1]) || 0 : 0   // max 25
      const lifestyleNewScore = lifestyleNewMatch ? parseInt(lifestyleNewMatch[1]) || 0 : 0 // max 10
      const humorOpenScore = humorOpenMatch ? parseInt(humorOpenMatch[1]) || 0 : 0 // max 15
      const communicationNewScore = communicationNewMatch ? parseInt(communicationNewMatch[1]) || 0 : 0 // max 10
      const intentValuesNewScore = intentValuesMatch ? parseInt(intentValuesMatch[1]) || 0 : 0 // max 5

      const hasNewModel = [synergyScore, vibeNewScore, lifestyleNewScore, humorOpenScore, communicationNewScore, intentValuesNewScore].some(s => s > 0)
    
    // Helper function to get strength level and color
    const getStrengthLevel = (score: number, maxScore: number) => {
      const percentage = (score / maxScore) * 100
      if (percentage >= 80) return { level: "ممتاز", color: "text-emerald-400", bgColor: "bg-emerald-500/20", borderColor: "border-emerald-400/30" }
      if (percentage >= 60) return { level: "جيد", color: "text-blue-400", bgColor: "bg-blue-500/20", borderColor: "border-blue-400/30" }
      if (percentage >= 40) return { level: "متوسط", color: "text-yellow-400", bgColor: "bg-yellow-500/20", borderColor: "border-yellow-400/30" }
      if (percentage >= 20) return { level: "ضعيف", color: "text-orange-400", bgColor: "bg-orange-500/20", borderColor: "border-orange-400/30" }
      return { level: "منخفض", color: "text-red-400", bgColor: "bg-red-500/20", borderColor: "border-red-400/30" }
    }
    
    // New model rendering
    const components = [] as Array<{ name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }>
    if (hasNewModel) {
      const synergyStrength = getStrengthLevel(synergyScore, 35)
      const vibeStrengthNew = getStrengthLevel(vibeNewScore, 20)
      const lifestyleStrengthNew = getStrengthLevel(lifestyleNewScore, 15)
      const humorOpenStrength = getStrengthLevel(humorOpenScore, 15)
      const communicationStrengthNew = getStrengthLevel(communicationNewScore, 10)
      const intentStrength = getStrengthLevel(intentValuesNewScore, 5)

      components.push({
        name: "الانسجام التفاعلي",
        strength: synergyStrength.level,
        color: synergyStrength.color,
        bgColor: synergyStrength.bgColor,
        borderColor: synergyStrength.borderColor,
        description: synergyScore >= 28 ? "انسجام عالٍ في الأدوار وعمق الحديث والراحة مع الصمت." :
                     synergyScore >= 18 ? "انسجام جيد مع بعض الفروقات التي تحتاج تنسيق بسيط." :
                     "اختلافات ملحوظة في أسلوب التفاعل تحتاج وقت للتأقلم."
      })

      components.push({
        name: "الطاقة والكيمياء",
        strength: vibeStrengthNew.level,
        color: vibeStrengthNew.color,
        bgColor: vibeStrengthNew.bgColor,
        borderColor: vibeStrengthNew.borderColor,
        description: vibeNewScore >= 14 ? "كيمياء واضحة وتوافق في الإحساس العام والحماس." :
                     vibeNewScore >= 8 ? "انسجام لطيف في الطاقة مع مساحة للنمو." :
                     "إيقاعات مختلفة قد تحتاجان لبعض الوقت للتقارب."
      })

      components.push({
        name: "نمط الحياة",
        strength: lifestyleStrengthNew.level,
        color: lifestyleStrengthNew.color,
        bgColor: lifestyleStrengthNew.bgColor,
        borderColor: lifestyleStrengthNew.borderColor,
        description: lifestyleNewScore >= 12 ? "روتين متقارب جداً في التوقيت والتخطيط والأنشطة." :
                     lifestyleNewScore >= 8 ? "تشابه جيد في الروتين مع اختلافات بسيطة." :
                     "إيقاعات يومية مختلفة قد تتطلب تنسيقاً."
      })

      components.push({
        name: "الدعابة والانفتاح",
        strength: humorOpenStrength.level,
        color: humorOpenStrength.color,
        bgColor: humorOpenStrength.bgColor,
        borderColor: humorOpenStrength.borderColor,
        description: humorOpenScore >= 12 ? "حس فكاهي متقارب وارتياح جميل للانفتاح المبكر." :
                     humorOpenScore >= 8 ? "انسجام جيد في الدعابة ومستوى الانفتاح." :
                     "أساليب مزاح أو انفتاح مختلفة تحتاج حساسية متبادلة."
      })

      components.push({
        name: "أسلوب التواصل",
        strength: communicationStrengthNew.level,
        color: communicationStrengthNew.color,
        bgColor: communicationStrengthNew.bgColor,
        borderColor: communicationStrengthNew.borderColor,
        description: communicationNewScore >= 8 ? "تفاهم سريع ولغة مشتركة واضحة." :
                     communicationNewScore >= 5 ? "تواصل سهل إجمالاً مع حاجة أحياناً للتوضيح." :
                     "أساليب تواصل مختلفة قد تتطلب مرونة أكبر."
      })

      components.push({
        name: "الأهداف والقيم",
        strength: intentStrength.level,
        color: intentStrength.color,
        bgColor: intentStrength.bgColor,
        borderColor: intentStrength.borderColor,
        description: intentValuesNewScore >= 4 ? "اتجاهات متشابهة في هدف اللقاء وما يعتبر مهماً." :
                     intentValuesNewScore >= 2 ? "تقارب معقول في الأهداف أو القيم العامة." :
                     "توقعات مختلفة قد تحتاج وضوحاً مبكراً."
      })

      return { components, originalReason: reason, metrics: { newModel: true, synergyScore, synergyMax: 35, synergyPercent: Math.max(0, Math.min(100, Math.round((synergyScore / 35) * 100))), vibe: vibeNewScore, lifestyle: lifestyleNewScore, humorOpen: humorOpenScore, communication: communicationNewScore, intentValues: intentValuesNewScore } }
    }

    // OLD model rendering
    const mbtiStrength = getStrengthLevel(mbtiScore, 5)
    const attachmentStrength = getStrengthLevel(attachmentScore, 5)
    const communicationStrength = getStrengthLevel(communicationScore, 10)
    const lifestyleStrength = getStrengthLevel(lifestyleScore, 15)
    const coreValuesStrength = getStrengthLevel(coreValuesScore, 20)
    const vibeStrength = getStrengthLevel(vibeScore, 20)

    // Create natural language description
    // Reuse components array for old model
    
    if (mbtiScore > 0) {
      components.push({
        name: "التوافق النفسي",
        strength: mbtiStrength.level,
        color: mbtiStrength.color,
        bgColor: mbtiStrength.bgColor,
        borderColor: mbtiStrength.borderColor,
        description: mbtiScore >= 7 ? "عقلان يفكران بنفس الطريقة - تتفقان في طريقة اتخاذ القرارات وتنظيم الحياة" : 
                    mbtiScore >= 5 ? "شخصيتان متكاملتان - بعض الاختلافات التي تجعل المحادثات أكثر إثارة" : 
                    "أضداد تتجاذب - شخصيتان مختلفتان تماماً قد تتعلمان الكثير من بعضهما"
      })
    }
    
    if (attachmentScore > 0) {
      components.push({
        name: "أسلوب التعلق",
        strength: attachmentStrength.level,
        color: attachmentStrength.color,
        bgColor: attachmentStrength.bgColor,
        borderColor: attachmentStrength.borderColor,
        description: attachmentScore >= 12 ? "نفس احتياجات القرب والأمان - ستشعران بالراحة والثقة بسرعة" : 
                    attachmentScore >= 8 ? "احتياجات عاطفية متقاربة - قليل من الصبر وستجدان التوازن المثالي" : 
                    "احتياجات مختلفة للمساحة الشخصية - أحدكما يحب القرب والآخر يقدر الاستقلالية"
      })
    }
    
    if (communicationScore > 0) {
      components.push({
        name: "أسلوب التواصل",
        strength: communicationStrength.level,
        color: communicationStrength.color,
        bgColor: communicationStrength.bgColor,
        borderColor: communicationStrength.borderColor,
        description: communicationScore >= 20 ? "تتكلمان نفس اللغة - تفهمان بعضكما من نظرة واحدة" : 
                    communicationScore >= 15 ? "تواصل سهل وطبيعي - أحياناً تحتاجان لتوضيح أكثر لكن التفاهم موجود" : 
                    "أساليب تواصل مختلفة - أحدكما مباشر والآخر يفضل الإشارات الخفية"
      })
    }
    
    if (lifestyleScore > 0) {
      components.push({
        name: "نمط الحياة",
        strength: lifestyleStrength.level,
        color: lifestyleStrength.color,
        bgColor: lifestyleStrength.bgColor,
        borderColor: lifestyleStrength.borderColor,
        description: lifestyleScore >= 12 ? "تعيشان نفس الإيقاع - نوم مبكر أم سهر؟ رياضة أم قراءة؟ أنتما متفقان" : 
                    lifestyleScore >= 8 ? "روتين متشابه مع لمسات مختلفة - ستجدان أنشطة مشتركة تستمتعان بها" : 
                    "عوالم مختلفة تماماً - أحدكما صباحي والآخر ليلي، لكن هذا قد يكون مثيراً"
      })
    }
    
    if (coreValuesScore > 0) {
      components.push({
        name: "القيم الأساسية",
        strength: coreValuesStrength.level,
        color: coreValuesStrength.color,
        bgColor: coreValuesStrength.bgColor,
        borderColor: coreValuesStrength.borderColor,
        description: coreValuesScore >= 16 ? "نفس المبادئ والأحلام - تتفقان على ما هو مهم في الحياة" : 
                    coreValuesScore >= 12 ? "قيم متقاربة مع اختلافات بسيطة - ستثري نقاشاتكما بوجهات نظر جديدة" : 
                    "أولويات مختلفة في الحياة - ما يهمك قد لا يهمه والعكس صحيح"
      })
    }
    
    if (vibeScore > 0) {
      components.push({
        name: "التوافق الشخصي",
        strength: vibeStrength.level,
        color: vibeStrength.color,
        bgColor: vibeStrength.bgColor,
        borderColor: vibeStrength.borderColor,
        description: vibeScore >= 12 ? "كيمياء قوية - طاقة متشابهة وحس دعابة متقارب، ستستمتعان بصحبة بعضكما" : 
                    vibeScore >= 8 ? "انسجام جيد - شخصيتان لطيفتان ستجدان أرضية مشتركة للمرح" : 
                    "طاقات مختلفة - أحدكما هادئ والآخر نشيط، قد تحتاجان وقت للتعود على بعضكما"
      })
    }
    
    return { components, originalReason: reason, metrics: { newModel: false, synergyScore: 0, synergyMax: 35, synergyPercent: 0, vibe: vibeScore || 0, lifestyle: lifestyleScore || 0, humorOpen: 0, communication: communicationScore || 0, intentValues: coreValuesScore || 0 } }
    } catch (error) {
      console.error("Error in formatCompatibilityReason:", error)
      return { components: [], originalReason: "معلومات التوافق غير متوفرة", metrics: { newModel: false, synergyScore: 0, synergyMax: 35, synergyPercent: 0, vibe: 0, lifestyle: 0, humorOpen: 0, communication: 0, intentValues: 0 } }
    }
  }

  const formatCompatibilityReason = (match: MatchResult): { components: CompatibilityComponent[]; originalReason: string; metrics: CompatibilityMetrics } => {
    const reason = typeof match.reason === 'string' ? match.reason : ''
    const snapshot = parseScoreObject(match.score_snapshot)
    const breakdown = match.score_breakdown
      ?? match.breakdown
      ?? parseScoreObject(snapshot?.scoreBreakdown ?? snapshot?.score_breakdown)
    const isBalanced = isCurrentBalancedScoreRow(match)
    const isOpposites = isCurrentOppositesScoreRow(match)

    if (isOpposites) {
      const dimensions = [
        { label: 'إيقاع التفاعل', value: Number(breakdown?.interactionSynergy ?? 0), max: 25, bar: 'from-emerald-500 to-teal-500' },
        { label: 'توافق القيم', value: Number(breakdown?.coreValuesAlignment ?? 0), max: 17, bar: 'from-violet-500 to-indigo-500' },
        { label: 'توافق التواصل', value: Number(breakdown?.communicationAlignment ?? 0), max: 4, bar: 'from-indigo-500 to-sky-500' },
        { label: 'اختلاف نمط الحياة', value: Number(breakdown?.lifestyleDifference ?? 0), max: 12, bar: 'from-cyan-500 to-blue-500' },
        { label: 'اختلاف الطاقة', value: Number(breakdown?.vibeDifference ?? 0), max: 12, bar: 'from-purple-500 to-pink-500' },
        { label: 'اختلاف الدعابة', value: Number(breakdown?.humorDifference ?? 0), max: 7, bar: 'from-amber-500 to-orange-500' },
      ]
      const components = dimensions.map(dimension => {
        const ratio = dimension.max > 0 ? dimension.value / dimension.max : 0
        return {
          name: dimension.label,
          strength: ratio >= 0.8 ? 'مرتفع' : ratio >= 0.6 ? 'جيد' : ratio >= 0.4 ? 'متوسط' : 'منخفض',
          color: ratio >= 0.6 ? 'text-violet-300' : 'text-slate-300',
          bgColor: 'bg-violet-500/10',
          borderColor: 'border-violet-400/25',
          description: dimension.label.startsWith('اختلاف')
            ? 'نقاط أعلى تعني اختلافاً أكبر في هذا البعد ضمن وضع الأضداد.'
            : 'هذا البعد يبقى توافقياً داخل صيغة الأضداد.',
        }
      })
      return {
        components,
        originalReason: reason,
        metrics: {
          newModel: true,
          balancedModel: false,
          oppositesModel: true,
          dimensions,
          synergyScore: dimensions[0].value,
          synergyMax: 25,
          synergyPercent: Math.round((dimensions[0].value / 25) * 100),
          sharedContext: 0,
          sharedContextMax: 0,
          vibe: dimensions[4].value,
          vibeMax: 12,
          lifestyle: dimensions[3].value,
          lifestyleMax: 12,
          humorOpen: dimensions[5].value,
          humorOpenMax: 7,
          communication: dimensions[2].value,
          communicationMax: 4,
          attachment: 0,
          attachmentMax: 0,
          valuesLanguage: dimensions[1].value,
          valuesLanguageMax: 17,
          intentValues: 0,
          intentMax: 0,
        },
      }
    }

    if (!isBalanced) {
      const legacy = formatLegacyCompatibilityReason(reason)
      return {
        ...legacy,
        metrics: {
          ...legacy.metrics,
          balancedModel: false,
          sharedContext: 0,
          sharedContextMax: 6,
          vibeMax: 25,
          lifestyleMax: 10,
          humorOpenMax: 15,
          communicationMax: 10,
          attachment: 0,
          attachmentMax: 8,
          valuesLanguage: 0,
          valuesLanguageMax: 17,
          intentMax: 5,
        },
      }
    }

    const finiteScore = (...values: unknown[]): number | null => {
      for (const value of values) {
        if (value === null || value === undefined || value === '') continue
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
      }
      return null
    }
    const reasonScore = (...labels: string[]): number | null => {
      const escaped = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
      const result = reason.match(new RegExp(`(?:${escaped})\\s*[:：]\\s*(-?\\d+(?:\\.\\d+)?)\\s*(?:/\\s*\\d+(?:\\.\\d+)?|%)?`, 'i'))
      return result ? finiteScore(result[1]) : null
    }

    const interaction = finiteScore(
      breakdown?.interactionRhythm,
      breakdown?.synergy,
      reasonScore('Interaction Rhythm', 'Synergy', 'إيقاع التفاعل', 'التفاعل'),
      match.synergy_score,
    ) ?? 0
    const aiVibe = finiteScore(
      breakdown?.aiSemantic,
      breakdown?.vibe,
      reasonScore('AI Semantic', 'AI Vibe', 'Vibe', 'التوافق الدلالي', 'الطاقة'),
      match.vibe_compatibility_score,
    ) ?? 0
    const commonGround = finiteScore(
      breakdown?.semanticCommonGround,
      reasonScore('Common Ground', 'الأرضية المشتركة'),
    )
    const sharedContext = finiteScore(
      breakdown?.sharedContext,
      reasonScore('Shared Context', 'السياق المشترك'),
      match.shared_context_score,
      commonGround == null ? null : Math.max(0, commonGround - aiVibe),
    ) ?? 0
    const humorOpen = finiteScore(
      breakdown?.humorOpenness,
      breakdown?.humorOpen,
      reasonScore('Humor/Openness', 'الدعابة/الانفتاح'),
      match.humor_open_score,
    ) ?? 0
    const attachment = finiteScore(
      breakdown?.attachmentComfort,
      reasonScore('Attachment Comfort', 'راحة التقارب'),
    ) ?? 0
    const lifestyle = finiteScore(
      breakdown?.lifestyleSustainability,
      breakdown?.lifestyle,
      reasonScore('Lifestyle', 'نمط الحياة'),
      match.lifestyle_compatibility_score,
    ) ?? 0
    const communication = finiteScore(
      breakdown?.communicationDisagreement,
      breakdown?.communication,
      reasonScore('Communication/Disagreement', 'التواصل/الاختلاف'),
      match.communication_disagreement_score,
      match.communication_compatibility_score,
    ) ?? 0
    const valuesBoundaries = finiteScore(
      breakdown?.valuesBoundaries,
      reasonScore('Values/Boundaries', 'القيم/الحدود'),
      match.values_boundaries_score,
    )
    const expressionLanguage = finiteScore(
      breakdown?.language,
      reasonScore('Expression Language', 'لغة التعبير'),
      match.language_score,
    )
    const valuesLanguage = finiteScore(
      breakdown?.valuesBoundariesLanguage,
      breakdown?.coreValues,
      match.core_values_compatibility_score,
      valuesBoundaries == null && expressionLanguage == null
        ? null
        : (valuesBoundaries ?? 0) + (expressionLanguage ?? 0),
    ) ?? 0
    const intent = finiteScore(
      breakdown?.intent,
      reasonScore('Intent', 'Goal', 'Goals', 'الهدف', 'الأهداف'),
      match.intent_score,
    ) ?? 0

    const strength = (score: number, maximum: number) => {
      const percentage = maximum > 0 ? (score / maximum) * 100 : 0
      if (percentage >= 80) return { level: 'ممتاز', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', borderColor: 'border-emerald-400/30' }
      if (percentage >= 60) return { level: 'جيد', color: 'text-blue-400', bgColor: 'bg-blue-500/20', borderColor: 'border-blue-400/30' }
      if (percentage >= 40) return { level: 'متوسط', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', borderColor: 'border-yellow-400/30' }
      if (percentage >= 20) return { level: 'ضعيف', color: 'text-orange-400', bgColor: 'bg-orange-500/20', borderColor: 'border-orange-400/30' }
      return { level: 'منخفض', color: 'text-red-400', bgColor: 'bg-red-500/20', borderColor: 'border-red-400/30' }
    }
    const components: CompatibilityComponent[] = []
    const addComponent = (name: string, score: number, maximum: number, descriptions: [string, string, string]) => {
      const style = strength(score, maximum)
      const ratio = maximum > 0 ? score / maximum : 0
      components.push({
        name,
        strength: style.level,
        color: style.color,
        bgColor: style.bgColor,
        borderColor: style.borderColor,
        description: ratio >= 0.8 ? descriptions[0] : ratio >= 0.6 ? descriptions[1] : descriptions[2],
      })
    }

    addComponent('السياق المشترك', sharedContext, 5, [
      'تركيز واهتمامات حالية تمنحكما أرضية حديث قوية.',
      'توجد نقاط مشتركة جيدة يمكن البناء عليها.',
      'قد تحتاجان لاكتشاف موضوع مشترك أثناء اللقاء.',
    ])
    addComponent('التوافق الدلالي بالذكاء الاصطناعي', aiVibe, 12, [
      'تقارب واضح في الاهتمامات والطاقة ووصف الشخصية.',
      'تشابه جيد في الاهتمامات مع مساحة للاكتشاف.',
      'اهتمامات مختلفة قد تصنع حواراً جديداً أو تحتاج وقتاً.',
    ])
    addComponent('الانسجام التفاعلي', interaction, 25, [
      'انسجام عالٍ في المبادرة وعمق الحديث والراحة مع الصمت.',
      'إيقاع تفاعل جيد مع فروقات بسيطة قابلة للتنسيق.',
      'اختلافات ملحوظة في أسلوب التفاعل تحتاج وقتاً للتأقلم.',
    ])
    addComponent('الدعابة والانفتاح', humorOpen, 7, [
      'حس فكاهي متقارب وارتياح جميل للانفتاح المبكر.',
      'انسجام جيد في الدعابة ومستوى الانفتاح.',
      'أساليب مزاح أو انفتاح مختلفة تحتاج حساسية متبادلة.',
    ])
    addComponent('راحة التقارب', attachment, 9, [
      'احتياجات متقاربة للقرب والطمأنة والمساحة الشخصية.',
      'إيقاع تقارب متوازن مع بعض الاختلافات البسيطة.',
      'احتياجات مختلفة للتقارب تستفيد من الوضوح والصبر.',
    ])
    addComponent('نمط الحياة', lifestyle, 12, [
      'روتين متقارب جداً في التوقيت والتخطيط والأنشطة.',
      'تشابه جيد في الروتين مع اختلافات بسيطة.',
      'إيقاعات يومية مختلفة قد تتطلب تنسيقاً.',
    ])
    addComponent('القيم والحدود ولغة التعبير', valuesLanguage, 17, [
      'تقارب قوي في القيم والحدود وطريقة التعبير.',
      'أساس قيمي جيد مع فروقات يمكن مناقشتها بوضوح.',
      'اختلافات في الأولويات أو الحدود تحتاج فهماً مبكراً.',
    ])
    addComponent('التواصل وإدارة الاختلاف', communication, 8, [
      'تفاهم سريع وأساليب متقاربة عند التواصل والاختلاف.',
      'تواصل سهل إجمالاً مع حاجة أحياناً للتوضيح.',
      'أساليب تواصل مختلفة قد تتطلب مرونة أكبر.',
    ])
    addComponent('هدف اللقاء', intent, 5, [
      'اتجاهات متشابهة بوضوح في هدف اللقاء.',
      'تقارب معقول في التوقعات والهدف.',
      'توقعات مختلفة تستفيد من الوضوح المبكر.',
    ])

    return {
      components,
      originalReason: reason || 'تحليل النموذج المتوازن',
      metrics: {
        newModel: true,
        balancedModel: true,
        synergyScore: interaction,
        synergyMax: 25,
        synergyPercent: Math.max(0, Math.min(100, Math.round((interaction / 25) * 100))),
        sharedContext,
        sharedContextMax: 5,
        vibe: aiVibe,
        vibeMax: 12,
        lifestyle,
        lifestyleMax: 12,
        humorOpen,
        humorOpenMax: 7,
        communication,
        communicationMax: 8,
        attachment,
        attachmentMax: 9,
        valuesLanguage,
        valuesLanguageMax: 17,
        intentValues: intent,
        intentMax: 5,
      },
    }
  }

  useEffect(() => {
    const fetchResults = async () => {
      if (!token) {
        setError("لم يتم توفير رمز صحيح")
        setLoading(false)
        return
      }

      try {
        // First check if results are visible
        const visibilityRes = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get-results-visibility" }),
        })
        if (!visibilityRes.ok) {
          throw new Error(`Could not check results visibility (${visibilityRes.status})`)
        }
        const visibilityData = await visibilityRes.json()
        
        if (visibilityData.visible === false) {
          setError("waiting")
          setLoading(false)
          return
        }

        const res = await fetch("/api/participant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get-match-results", secure_token: token }),
        })
        
        const data = await res.json()
        
        if (data.success) {
          // Filter out matches with organizer (participant #9999)
          const filteredHistory = (data.history || []).filter((match: MatchResult) =>
            match.with !== 9999 &&
            match.with !== "المنظم" &&
            match.round !== 0
          )
          
          setResultsData({
            assigned_number: data.assigned_number,
            event_id: data.event_id || 1,
            event_format: data.event_format ?? null,
            history: filteredHistory
          })
          setError(null)
        } else {
          setError(data.error || "لم يتم العثور على بيانات المشارك أو الرمز غير صحيح")
        }
      } catch (err) {
        console.error("Error fetching results:", err)
        setError("حدث خطأ أثناء جلب البيانات")
      } finally {
        setLoading(false)
      }
    }

    fetchResults()
  }, [token])

  useEffect(() => {
    if (!resultsData?.history?.length) return
    setExpandedEvents(prev => {
      if (prev && Object.keys(prev).length > 0) return prev
      const maxEventId = resultsData.history.reduce((max, m) => {
        const eid = typeof m.event_id === 'number' && m.event_id > 0 ? m.event_id : 0
        return eid > max ? eid : max
      }, 0)
      const safeEventId = maxEventId > 0 ? maxEventId : (resultsData.event_id || 1)
      return { [safeEventId]: true }
    })
  }, [resultsData])

  const getMatchStatusText = (match: MatchResult) => {
    if (match.wants_match === null || match.wants_match === undefined) {
      return { text: "لم تقيم بعد", color: "text-yellow-500", bgColor: "bg-yellow-100", icon: Clock }
    }
    if (match.mutual_match) {
      return { text: "مطابقة متبادلة!", color: "text-emerald-500", bgColor: "bg-emerald-100", icon: Heart }
    }
    if (match.wants_match === false) {
      return { text: "لا توجد مطابقة", color: "text-red-500", bgColor: "bg-red-100", icon: X }
    }
    return { text: "لم تتحقق مطابقة", color: "text-gray-500", bgColor: "bg-gray-100", icon: Clock }
  }

  const eventGroups = (() => {
    const history = resultsData?.history || []
    const grouped = new Map<number, Array<{ match: MatchResult; matchIndex: number }>>()

    history.forEach((m, matchIndex) => {
      const eventId = (typeof m.event_id === 'number' && m.event_id > 0)
        ? m.event_id
        : (resultsData?.event_id || 1)
      const arr = grouped.get(eventId) || []
      arr.push({ match: { ...m, event_id: eventId }, matchIndex })
      grouped.set(eventId, arr)
    })

    return Array.from(grouped.entries())
      .map(([event_id, items]) => ({
        event_id,
        items: items
          .slice()
          .sort((a, b) => {
            const ra = a.match.round ?? 1
            const rb = b.match.round ?? 1
            if (ra !== rb) return ra - rb
            const ta = a.match.created_at ? new Date(a.match.created_at).getTime() : 0
            const tb = b.match.created_at ? new Date(b.match.created_at).getTime() : 0
            return tb - ta
          })
      }))
      .filter(group => group.event_id >= 20 || group.items.some(i => i.match.match_type === 'choice' || i.match.match_type === 'algorithm' || i.match.match_type === 'third_choice'))
      .sort((a, b) => {
        const aE3 = a.event_id >= 20 || a.items.some(i => i.match.match_type === 'choice' || i.match.match_type === 'algorithm' || i.match.match_type === 'third_choice')
        const bE3 = b.event_id >= 20 || b.items.some(i => i.match.match_type === 'choice' || i.match.match_type === 'algorithm' || i.match.match_type === 'third_choice')
        if (aE3 !== bE3) return aE3 ? -1 : 1
        return b.event_id - a.event_id
      })
  })()

  if (loading) {
    return (
      <div className={`min-h-screen ${dark ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-br from-blue-50 to-indigo-100'}`} dir="rtl">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
            <p className={`text-xl ${dark ? 'text-slate-200' : 'text-gray-800'}`}>جاري تحميل النتائج...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07111f] text-white" dir="rtl">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -right-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-cyan-500/[0.10] blur-[120px]" />
        <div className="absolute -bottom-64 -left-48 h-[38rem] w-[38rem] rounded-full bg-purple-600/[0.12] blur-[140px]" />
        <div className="absolute inset-0 opacity-[0.055]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-7">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between rounded-2xl border border-white/[0.09] bg-slate-950/65 p-2 shadow-[0_18px_55px_-35px_rgba(34,211,238,.35)] backdrop-blur-xl sm:mb-8 sm:p-3">
          <div className="flex items-center gap-4">
            <Link 
              to="/" 
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.045] text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <ArrowLeft className="w-6 h-6" />
            </Link>
            
            {resultsData && (
              <div className={`flex items-center gap-3`}>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/30 bg-gradient-to-br from-cyan-400/15 to-blue-500/10 shadow-inner shadow-cyan-300/10 sm:h-12 sm:w-12">
                  <span className="text-sm font-black text-cyan-200 sm:text-base">
                    #{resultsData.assigned_number}
                  </span>
                </div>
                <div>
                  <h1 className="text-lg font-black tracking-tight text-white sm:text-2xl">
                    نتائج التوافق
                  </h1>
                  <p className="hidden text-xs text-slate-400 sm:block sm:text-sm">
                    رحلتك، اختياراتك، ونتائج التوافق
                  </p>
                </div>
              </div>
            )}
          </div>
          
          <Link to="/" className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.045] px-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08] sm:px-4">
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg">
                <img src="/blindmatch-imprint.png" alt="" className="h-8 w-8 scale-[1.3] object-contain opacity-100" />
              </span>
              <span className="hidden sm:inline">الصفحة الرئيسية</span>
          </Link>
        </div>

        {/* Content */}
        <div className="rounded-[1.75rem] border border-white/[0.075] bg-slate-950/35 p-2.5 shadow-[0_28px_90px_-55px_rgba(56,189,248,.45)] backdrop-blur-xl sm:p-5">
          {error === "waiting" ? (
            <div className={`text-center py-12 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
              <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-6"></div>
              <h2 className={`text-2xl font-bold mb-4 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                النتائج قيد المراجعة
              </h2>
              <p className="text-lg mb-4">
                يتم حالياً مراجعة النتائج من قبل المنظمين
              </p>
              <p className="text-sm opacity-75 mb-6">
                سيتم عرض النتائج قريباً، يرجى الانتظار...
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <Button 
                  onClick={() => window.location.reload()}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <RefreshCcw className="w-4 h-4 mr-2" />
                  تحديث الصفحة
                </Button>
                <Link to="/" className="inline-block">
                  <Button variant="outline" className={`${dark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-gray-300'}`}>
                    العودة للصفحة الرئيسية
                  </Button>
                </Link>
              </div>
            </div>
          ) : error ? (
            <div className={`text-center py-8 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-lg font-semibold mb-2">خطأ في تحميل البيانات</p>
              <p>{error}</p>
              <Link to="/" className="mt-4 inline-block">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  العودة للصفحة الرئيسية
                </Button>
              </Link>
            </div>
          ) : !resultsData?.history?.length ? (
            <div className={`text-center py-8 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
              <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-semibold mb-2">لا توجد نتائج مطابقة</p>
              <p>لم تشارك في أي جلسات مطابقة بعد، أو لم تكتمل النتائج.</p>
              <Link to="/" className="mt-4 inline-block">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  العودة للصفحة الرئيسية
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {eventGroups.map(({ event_id, items }) => {
                const isEventExpanded = expandedEvents[event_id]
                const choiceOnlyEvent = eventUsesChoiceOnlyFormat(items)
                  || (event_id === resultsData?.event_id && resultsData?.event_format === CHOICE_ONLY_EVENT_FORMAT)
                
                return (
                  <div key={event_id} className={`overflow-hidden rounded-2xl border transition-all duration-300 ${
                    groupIsEvent3(items)
                      ? 'border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.075] via-blue-500/[0.045] to-purple-500/[0.075] shadow-[inset_0_1px_0_rgba(255,255,255,.04)]'
                      : (dark ? 'bg-slate-700/30 border-slate-600/50' : 'bg-gray-50 border-gray-200')
                  }`}>
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => setExpandedEvents(prev => ({ ...prev, [event_id]: !prev[event_id] }))}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 ${
                            groupIsEvent3(items)
                              ? 'bg-gradient-to-br from-cyan-400/15 to-purple-500/15 border-cyan-300/30'
                              : (dark ? 'bg-indigo-600/20 border-indigo-400' : 'bg-indigo-100 border-indigo-300')
                          }`}>
                            <span className={`font-bold text-sm ${
                              groupIsEvent3(items)
                                ? 'text-cyan-200'
                                : (dark ? 'text-indigo-200' : 'text-indigo-700')
                            }`}>
                              {event_id}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`font-bold ${
                              groupIsEvent3(items)
                                ? 'text-white'
                                : (dark ? 'text-slate-200' : 'text-gray-800')
                            }`}>
                              {groupIsEvent3(items) ? (choiceOnlyEvent ? 'التوافق الأعمى 5.0 — ثلاثة اختيارات متبادلة' : 'التوافق الأعمى 5.0 — اختيارك واختيارنا') : `فعالية رقم ${event_id}`}
                            </div>
                            <div className={`text-xs ${
                              groupIsEvent3(items)
                                ? 'text-cyan-200/60'
                                : (dark ? 'text-slate-400' : 'text-gray-600')
                            }`}>
                              {groupIsEvent3(items) ? (choiceOnlyEvent ? '✨ لقاءات الاختيار الأول والثاني والثالث' : '✨ الجولة النهائية — اختيارك والخوارزمية') : formatSessionCount(items.length)}
                            </div>
                          </div>
                        </div>

                        {isEventExpanded ? (
                          <ChevronUp className={`w-5 h-5 ${dark ? 'text-slate-400' : 'text-gray-500'}`} />
                        ) : (
                          <ChevronDown className={`w-5 h-5 ${dark ? 'text-slate-400' : 'text-gray-500'}`} />
                        )}
                      </div>
                    </div>

                    {isEventExpanded && (
                      <div className="border-t border-white/[0.07] px-3 pb-3 sm:px-4 sm:pb-4">
                        <div className="pt-4 space-y-3">
                          {items.map(({ match, matchIndex }) => {
                            const status = getMatchStatusText(match)
                            const StatusIcon = status.icon
                            const isExpanded = expandedMatches[matchIndex]
                            const choiceOnlyMatch = isChoiceOnlyEventMatch(match) || choiceOnlyEvent
                            
                            return (
                              <div key={matchIndex} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,.025)] transition duration-200 hover:border-cyan-300/15 hover:bg-white/[0.05]">
                                {/* Collapsible Header */}
                                <div 
                                  className="cursor-pointer p-3 sm:p-4"
                                  onClick={() => setExpandedMatches(prev => ({ ...prev, [matchIndex]: !prev[matchIndex] }))}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/10 shadow-[0_0_24px_-12px_rgba(34,211,238,.9)] sm:h-12 sm:w-12">
                                        <span className={`font-bold text-sm ${dark ? 'text-cyan-200' : 'text-cyan-700'}`}>
                                          #{match.with}
                                        </span>
                                      </div>
                                      
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          <h3 className={`font-bold text-sm sm:text-base truncate ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                                            {match.partner_name || 'شريك المحادثة'}
                                          </h3>
                                          {/* Event 3+: show choice/algorithm badge instead of round */}
                                          {match.match_type === 'choice' ? (
                                            <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 bg-pink-500/20 text-pink-300 border border-pink-500/30">
                                              <Heart className="w-3 h-3" />
                                              {event3MatchLabel(match, choiceOnlyMatch)}
                                            </span>
                                          ) : match.match_type === 'algorithm' ? (
                                            <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                              {choiceOnlyMatch ? <Heart className="w-3 h-3" /> : <Brain className="w-3 h-3" />}
                                              {event3MatchLabel(match, choiceOnlyMatch)}
                                            </span>
                                          ) : match.match_type === 'third_choice' ? (
                                            <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 bg-violet-500/20 text-violet-300 border border-violet-500/30">
                                              <Heart className="w-3 h-3" />
                                              {event3MatchLabel(match, choiceOnlyMatch)}
                                            </span>
                                          ) : (
                                            <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                              dark ? 'bg-slate-600/70 text-slate-200' : 'bg-gray-200/70 text-gray-700'
                                            }`}>
                                              {match.round === 2 ? 'الجولة الثانية' : 'الجولة الأولى'}
                                            </span>
                                          )}
                                          {match.is_repeat_match && (
                                            <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                              dark ? 'bg-amber-600/70 text-amber-200' : 'bg-amber-200/70 text-amber-700'
                                            }`}>
                                              تكرار
                                            </span>
                                          )}
                                        </div>
                                        
                                        <div className="flex items-center gap-2 flex-wrap">
                                          {/* Same match badge for event3 */}
                                          {!choiceOnlyMatch && e3SameMatchByEvent[match.event_id ?? 0] && match.match_type === 'choice' && (
                                            <span className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-bold">
                                              <Trophy className="w-3.5 h-3.5" />
                                              مطابقة مثالية!
                                            </span>
                                          )}
                                          {/* Status Badge - Enhanced for Mutual Match */}
                                          {match.mutual_match ? (
                                            <div className="relative">
                                              <span className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full opacity-50 blur-sm animate-pulse"></span>
                                              <span className="relative flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-3 py-1.5 text-xs font-black text-white shadow-lg sm:px-4 sm:py-2 sm:text-sm">
                                                <Handshake className="w-4 h-4 animate-pulse" />
                                                مطابقة متبادلة!
                                              </span>
                                            </div>
                                          ) : (
                                            <span className={`text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 font-medium ${
                                              dark ? `${status.bgColor}/20 ${status.color}` : `${status.bgColor} ${status.color}`
                                            }`}>
                                              <StatusIcon className="w-3.5 h-3.5" />
                                              {status.text}
                                            </span>
                                          )}
                                          
                                          {/* Score Badge */}
                                          {!choiceOnlyMatch && (
                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
                                              getOriginalScore(match) >= 70 ? 'bg-green-500/10 border border-green-500/30' :
                                              getOriginalScore(match) >= 50 ? 'bg-yellow-500/10 border border-yellow-500/30' :
                                              'bg-red-500/10 border border-red-500/30'
                                            }`}>
                                              <Award className={`w-3.5 h-3.5 ${
                                                getOriginalScore(match) >= 70 ? 'text-green-500' :
                                                getOriginalScore(match) >= 50 ? 'text-yellow-500' :
                                                'text-red-500'
                                              }`} />
                                              <span className={`text-sm font-bold ${
                                                getOriginalScore(match) >= 70 ? 'text-green-500' :
                                                getOriginalScore(match) >= 50 ? 'text-yellow-500' :
                                                'text-red-500'
                                              }`}>
                                                {getOriginalScore(match)}%
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {match.mutual_match && (
                                        <Handshake className="w-5 h-5 text-emerald-500 animate-pulse" />
                                      )}
                                      {isExpanded ? (
                                        <ChevronUp className={`w-5 h-5 ${dark ? 'text-slate-400' : 'text-gray-500'}`} />
                                      ) : (
                                        <ChevronDown className={`w-5 h-5 ${dark ? 'text-slate-400' : 'text-gray-500'}`} />
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Expanded Content */}
                                {isExpanded && (
                                  <div className="border-t border-white/[0.07] px-3 pb-3 sm:px-4 sm:pb-4">
                                    <div className="pt-4 space-y-4">
                          {/* Event 3: Match word display */}
                          {match.match_word && (
                            <div className={`p-3 rounded-xl border text-center ${
                              match.match_type === 'choice'
                                ? 'bg-pink-500/10 border-pink-500/20'
                                : match.match_type === 'third_choice'
                                  ? 'bg-violet-500/10 border-violet-500/20'
                                  : 'bg-purple-500/10 border-purple-500/20'
                            }`}>
                              <p className={`text-xs mb-1 ${match.match_type === 'choice' ? 'text-pink-400' : match.match_type === 'third_choice' ? 'text-violet-400' : 'text-purple-400'}`}>
                                {choiceOnlyMatch
                                  ? (match.match_type === 'choice' ? 'كلمتك عن لقاء الاختيار الأول' : match.match_type === 'third_choice' ? 'كلمتك عن لقاء الاختيار الثالث' : 'كلمتك عن لقاء الاختيار الثاني')
                                  : (match.match_type === 'choice' ? 'الكلمة التي اخترتها' : 'الكلمة التي اختارتها الخوارزمية')}
                              </p>
                              <p className={`text-lg font-bold ${dark ? 'text-white' : 'text-gray-800'}`}>
                                "{match.match_word}"
                              </p>
                            </div>
                          )}
                          {/* Event 3: Match preference indicator */}
                          {match.match_preference && match.match_type === 'choice' && (
                            <div className={`p-3 rounded-xl border flex items-center gap-2 ${matchPreferenceStyle(match.match_preference).box}`}>
                              <span className={`text-xs font-medium ${matchPreferenceStyle(match.match_preference).text}`}>
                                تفضيلك: {matchPreferenceLabel(match.match_preference, choiceOnlyMatch)}
                              </span>
                            </div>
                          )}
                          {choiceOnlyMatch && (
                            <div className="rounded-2xl border border-pink-400/15 bg-pink-500/[0.07] p-4 text-sm leading-6 text-pink-100/80">
                              هذا اللقاء جاء من ترتيبكما المتبادل فقط. درجات التوافق والخوارزمية لم تدخل في اختيار الشريك.
                            </div>
                          )}
                          {/* Compatibility Score */}
                          {!choiceOnlyMatch && (
                          <div className="rounded-2xl border border-white/[0.08] bg-slate-950/35 p-4 sm:p-5">
                            <div className="flex justify-between items-center mb-3">
                              <div className="flex items-center gap-2">
                                <Award className={`w-5 h-5 ${
                                  getOriginalScore(match) >= 70 ? 'text-green-500' :
                                  getOriginalScore(match) >= 50 ? 'text-yellow-500' :
                                  'text-red-500'
                                }`} />
                                <span className={`font-semibold text-sm ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                                  درجة التوافق الإجمالية
                                </span>
                              </div>
                              <span className={`font-bold text-2xl ${
                                getOriginalScore(match) >= 70 ? 'text-green-500' :
                                getOriginalScore(match) >= 50 ? 'text-yellow-500' :
                                getOriginalScore(match) >= 30 ? 'text-orange-500' :
                                'text-red-500'
                              }`}>
                                {getOriginalScore(match)}%
                              </span>
                            </div>
                            <div className={`w-full h-2.5 rounded-full ${dark ? 'bg-slate-600' : 'bg-gray-200'}`}>
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  getOriginalScore(match) >= 70 ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                                  getOriginalScore(match) >= 50 ? 'bg-gradient-to-r from-yellow-500 to-amber-500' :
                                  getOriginalScore(match) >= 30 ? 'bg-gradient-to-r from-orange-500 to-red-500' :
                                  'bg-gradient-to-r from-red-500 to-pink-500'
                                }`}
                                style={{ width: `${getOriginalScore(match)}%` }}
                              ></div>
                            </div>
                          </div>
                          )}

                          {/* Match Analysis */}
                          {!choiceOnlyMatch && (
                          <div className="rounded-2xl border border-white/[0.07] bg-slate-950/25 p-3 sm:p-4">
                            {(() => {
                              const formattedReason = formatCompatibilityReason(match)
                              if (formattedReason.components.length === 0) {
                                return (
                                  <div>
                                    <h4 className={`font-semibold text-sm mb-1 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                                      تحليل التوافق
                                    </h4>
                                    <p className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
                                      لا يوجد تحليل متوفر
                                    </p>
                                  </div>
                                )
                              }
                              // Version-aware score overview. Historical rows keep their original budgets.
                              const m = formattedReason.metrics
                              return (
                                <div className="space-y-3">
                                  {(() => {
                                    const hasNumeric = (
                                      (typeof match.synergy_score === 'number' && match.synergy_score > 0) ||
                                      (typeof match.humor_open_score === 'number' && match.humor_open_score > 0) ||
                                      (typeof match.intent_score === 'number' && match.intent_score > 0) ||
                                      (typeof match.communication_compatibility_score === 'number' && match.communication_compatibility_score > 0) ||
                                      (typeof match.lifestyle_compatibility_score === 'number' && match.lifestyle_compatibility_score > 0) ||
                                      (typeof match.vibe_compatibility_score === 'number' && match.vibe_compatibility_score > 0)
                                    )
                                    if (!(m?.newModel || hasNumeric)) return null
                                    return (
                                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                                      <div className={`mb-2 rounded-lg border px-2 py-1 text-[10px] font-bold ${m.balancedModel ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300' : m.oppositesModel ? 'border-violet-400/25 bg-violet-500/10 text-violet-300' : 'border-amber-400/25 bg-amber-500/10 text-amber-300'}`}>
                                        {m.balancedModel ? 'نموذج دليل التوافق الحالي · لقطة وقت المطابقة' : m.oppositesModel ? 'وضع الأضداد الحالي · لقطة وقت المطابقة · 77→100' : `حسبة تاريخية موروثة${match.score_model_version ? ` · ${match.score_model_version}` : ''}`}
                                      </div>
                                      {/* Matrix-like detailed criteria with value/max and % */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {(() => {
                                          const useParsedValues = m.newModel
                                          const synergyVal = useParsedValues ? m.synergyScore : (typeof match.synergy_score === 'number' ? match.synergy_score : 0)
                                          const vibeVal = useParsedValues ? m.vibe : (typeof match.vibe_compatibility_score === 'number' ? match.vibe_compatibility_score : 0)
                                          const lifestyleVal = useParsedValues ? m.lifestyle : (typeof match.lifestyle_compatibility_score === 'number' ? match.lifestyle_compatibility_score : 0)
                                          const humorOpenVal = useParsedValues ? m.humorOpen : (typeof match.humor_open_score === 'number' ? match.humor_open_score : 0)
                                          const communicationVal = useParsedValues ? m.communication : (typeof match.communication_compatibility_score === 'number' ? match.communication_compatibility_score : 0)
                                          const intentVal = useParsedValues ? m.intentValues : (typeof match.intent_score === 'number' ? match.intent_score : 0)
                                          const items = m.oppositesModel && m.dimensions
                                            ? m.dimensions
                                            : m.balancedModel
                                            ? [
                                                { label: 'السياق المشترك', value: m.sharedContext, max: 5, bar: 'from-sky-500 to-cyan-500' },
                                                { label: 'توافق AI', value: vibeVal, max: 12, bar: 'from-purple-500 to-pink-500' },
                                                { label: 'التفاعل', value: synergyVal, max: 25, bar: 'from-emerald-500 to-teal-500' },
                                                { label: 'الدعابة/الانفتاح', value: humorOpenVal, max: 7, bar: 'from-amber-500 to-orange-500' },
                                                { label: 'راحة التقارب', value: m.attachment, max: 9, bar: 'from-rose-500 to-pink-500' },
                                                { label: 'نمط الحياة', value: lifestyleVal, max: 12, bar: 'from-cyan-500 to-blue-500' },
                                                { label: 'القيم/الحدود/اللغة', value: m.valuesLanguage, max: 17, bar: 'from-violet-500 to-indigo-500' },
                                                { label: 'التواصل/الاختلاف', value: communicationVal, max: 8, bar: 'from-indigo-500 to-sky-500' },
                                                { label: 'الهدف', value: intentVal, max: 5, bar: 'from-emerald-500 to-teal-500' },
                                              ]
                                            : [
                                                { label: 'التفاعل', value: synergyVal, max: m.synergyMax ?? 35, bar: 'from-emerald-500 to-teal-500' },
                                                { label: 'الطاقة', value: vibeVal, max: 25, bar: 'from-purple-500 to-pink-500' },
                                                { label: 'نمط الحياة', value: lifestyleVal, max: 10, bar: 'from-cyan-500 to-blue-500' },
                                                { label: 'الدعابة/الانفتاح', value: humorOpenVal, max: 15, bar: 'from-amber-500 to-orange-500' },
                                                { label: 'التواصل', value: communicationVal, max: 10, bar: 'from-indigo-500 to-sky-500' },
                                                { label: 'الأهداف', value: intentVal, max: 5, bar: 'from-emerald-500 to-teal-500' },
                                              ]
                                          return items.map(({ label, value, max, bar }, i) => {
                                            const safeMax = max > 0 ? max : 1
                                            const raw = typeof value === 'number' ? value : 0
                                            const displayScore = Number(raw.toFixed(1))
                                            const pct = Math.max(0, Math.min(100, Math.round((raw / safeMax) * 100)))
                                            const pctColor = pct >= 80 ? 'text-emerald-400' : pct >= 70 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : pct >= 40 ? 'text-orange-400' : 'text-red-400'
                                            return (
                                              <div key={i} className="rounded-lg border border-white/[0.055] bg-slate-950/35 p-2.5">
                                                <div className="flex items-center justify-between mb-1">
                                                  <span className={`text-[11px] font-semibold ${dark ? 'text-slate-200' : 'text-gray-800'}`}>{label}</span>
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono text-slate-400">{displayScore}/{safeMax}</span>
                                                    <span className={`text-[11px] font-bold ${pctColor}`}>{pct}%</span>
                                                  </div>
                                                </div>
                                                <div className={`w-full h-1.5 rounded-full ${dark ? 'bg-slate-700' : 'bg-gray-200'}`}>
                                                  <div className={`h-full rounded-full bg-gradient-to-r ${bar}`} style={{ width: `${pct}%` }} />
                                                </div>
                                              </div>
                                            )
                                          })
                                        })()}
                                      </div>
                                    </div>
                                    )
                                  })()}
                                  <h4 className={`font-semibold text-sm ${dark ? 'text-slate-200' : 'text-gray-800'}`}>تحليل التوافق</h4>
                                  <div className="grid grid-cols-1 gap-2">
                                    {formattedReason.components.map((component: { name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }, compIndex: number) => (
                                      <div
                                        key={compIndex}
                                        className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 backdrop-blur-sm"
                                      >
                                        <div className="flex items-center justify-between mb-1">
                                          <span className={`text-xs font-semibold ${dark ? "text-slate-200" : "text-gray-800"}`}>
                                            {component.name}
                                          </span>
                                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${component.color} ${component.bgColor}`}>
                                            {component.strength}
                                          </span>
                                        </div>
                                        <p className={`text-xs ${dark ? "text-slate-300" : "text-gray-600"}`}>
                                          {component.description}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                          )}

                          {/* AI Vibe Analysis Button (if exists) */}
                          {!choiceOnlyMatch && match.ai_personality_analysis && (
                            <div>
                              <Button
                                onClick={() => setShowAiAnalysis(prev => ({ ...prev, [matchIndex]: !prev[matchIndex] }))}
                                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm"
                              >
                                <Sparkles className="w-4 h-4 ml-2" />
                                {showAiAnalysis[matchIndex] ? "إخفاء التحليل الذكي" : "اكتشف سبب توافقكما الرائع!"}
                              </Button>
                              
                              {showAiAnalysis[matchIndex] && (
                                <div className={`mt-3 p-4 rounded-lg border ${
                                  dark ? 'bg-gradient-to-br from-purple-900/20 to-pink-900/20 border-purple-400/30' : 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200'
                                }`}>
                                  <div className="flex items-center gap-2 mb-3">
                                    <Sparkles className={`w-5 h-5 ${dark ? 'text-purple-300' : 'text-purple-600'}`} />
                                    <h4 className={`font-bold ${dark ? 'text-purple-200' : 'text-purple-700'}`}>
                                      لماذا تتوافقان بشكل رائع؟
                                    </h4>
                                  </div>
                                  <p className={`text-sm leading-relaxed whitespace-pre-line ${
                                    dark ? 'text-slate-200' : 'text-gray-700'
                                  }`}>
                                    {match.ai_personality_analysis}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Partner Contact Info (if mutual match) */}
                          {match.mutual_match && (match.partner_name || match.partner_phone) && (
                            <div className="relative overflow-hidden rounded-2xl border border-emerald-300/25 bg-gradient-to-br from-emerald-400/[0.15] via-cyan-400/[0.08] to-transparent p-4 shadow-[0_20px_50px_-30px_rgba(52,211,153,.8)] sm:p-5">
                              <div className="pointer-events-none absolute -left-8 -top-10 h-28 w-28 rounded-full bg-emerald-300/15 blur-3xl" />
                              <div className="relative mb-3 flex items-center gap-2">
                                <Handshake className={`w-4 h-4 ${dark ? 'text-emerald-200' : 'text-emerald-700'}`} />
                                <h4 className={`font-bold text-sm ${dark ? 'text-emerald-200' : 'text-emerald-700'}`}>
                                  معلومات التواصل - مطابقة متبادلة!
                                </h4>
                              </div>
                              <div className="relative grid gap-2 text-sm sm:grid-cols-3">
                                {match.partner_name && (
                                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-slate-950/25 px-3 py-2.5 text-slate-100">
                                    <User className="w-3 h-3" />
                                    <span>الاسم: </span>
                                    <span className="font-bold">{match.partner_name}</span>
                                  </div>
                                )}
                                {match.partner_age && (
                                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-slate-950/25 px-3 py-2.5 text-slate-100">
                                    <Users className="w-3 h-3" />
                                    <span>العمر: </span>
                                    <span className="font-bold">{match.partner_age}</span>
                                  </div>
                                )}
                                {match.partner_phone && (
                                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-slate-950/25 px-3 py-2.5 text-slate-100" dir="ltr">
                                    <Phone className="w-3 h-3" />
                                    <span>الهاتف: </span>
                                    <span className="font-bold">{match.partner_phone}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                    </div>
                  </div>
                )}
              </div>
            )
          })}
            </div>
          </div>
          )}
        </div>
      )
      })}
    </div>
  )}
        </div>
      </div>
    </div>
  )
}
