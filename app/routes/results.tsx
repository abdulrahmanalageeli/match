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
  MessageCircle,
  Award,
  Users
} from "lucide-react"
import { Button } from "../../components/ui/button"

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
  score: number
  is_repeat_match?: boolean
  mutual_match?: boolean
  wants_match?: boolean | null
  partner_wants_match?: boolean | null
  created_at?: string
  ai_personality_analysis?: string | null
  event_id?: number
  partner_message?: string | null
  humor_early_openness_bonus?: 'full' | 'partial' | 'none'
  // New model numeric fields (optional, returned by API if available)
  synergy_score?: number | null
  humor_open_score?: number | null
  intent_score?: number | null
  communication_compatibility_score?: number | null
  lifestyle_compatibility_score?: number | null
  vibe_compatibility_score?: number | null
}

interface ResultsData {
  assigned_number: number
  event_id: number
  history: MatchResult[]
}

export default function ResultsPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resultsData, setResultsData] = useState<ResultsData | null>(null)
  const [dark] = useState(true) // Match the welcome page theme
  const [showAiAnalysis, setShowAiAnalysis] = useState<{[key: number]: boolean}>({})
  const [showPartnerMessage, setShowPartnerMessage] = useState<{[key: number]: boolean}>({})
  const [expandedMatches, setExpandedMatches] = useState<{[key: number]: boolean}>({})
  
  // Helper: show the final score exactly as stored (matches matrix)
  const getOriginalScore = (match: MatchResult): number => {
    return Math.round(match.score)
  }

  // Function to convert technical compatibility reason to natural Arabic description
  // Enhanced to expose structured metrics for the new model (Synergy, Vibe, Lifestyle, Humor/Openness, Communication, Goals/Values)
  const formatCompatibilityReason = (reason: string): { components: Array<{ name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }>; originalReason: string; metrics: { newModel: boolean; synergyScore: number; synergyMax: number; synergyPercent: number; vibe: number; lifestyle: number; humorOpen: number; communication: number; intentValues: number } } => {
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

      const synergyScore = synergyMatch ? parseInt(synergyMatch[1]) || 0 : 0 // max 35
      const vibeNewScore = vibeNewMatch ? parseInt(vibeNewMatch[1]) || 0 : 0   // max 20
      const lifestyleNewScore = lifestyleNewMatch ? parseInt(lifestyleNewMatch[1]) || 0 : 0 // max 15
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
        const visibilityData = await visibilityRes.json()
        
        if (!visibilityData.visible) {
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
            match.with !== 9999 && match.with !== "المنظم"
          )
          
          setResultsData({
            assigned_number: data.assigned_number,
            event_id: data.event_id || 1,
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

  const getMatchStatusText = (match: MatchResult) => {
    if (match.wants_match === null || match.partner_wants_match === null) {
      return { text: "شريكك لم يقبل بعد", color: "text-yellow-500", bgColor: "bg-yellow-100", icon: Clock }
    }
    if (match.mutual_match) {
      return { text: "مطابقة متبادلة!", color: "text-emerald-500", bgColor: "bg-emerald-100", icon: Heart }
    }
    if (match.wants_match === false || match.partner_wants_match === false) {
      return { text: "لا توجد مطابقة", color: "text-red-500", bgColor: "bg-red-100", icon: X }
    }
    return { text: "شريكك لم يقبل بعد", color: "text-yellow-500", bgColor: "bg-yellow-100", icon: Clock }
  }

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
    <div className={`min-h-screen ${dark ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-br from-blue-50 to-indigo-100'}`} dir="rtl">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link 
              to="/" 
              className={`p-2 rounded-lg transition-colors ${
                dark ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
              }`}
            >
              <ArrowLeft className="w-6 h-6" />
            </Link>
            
            {resultsData && (
              <div className={`flex items-center gap-3`}>
                <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${
                  dark ? 'bg-blue-600/20 border-blue-400' : 'bg-blue-100 border-blue-300'
                }`}>
                  <span className={`text-lg font-bold ${dark ? 'text-blue-200' : 'text-blue-700'}`}>
                    #{resultsData.assigned_number}
                  </span>
                </div>
                <div>
                  <h1 className={`text-2xl font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
                    نتائج التوافق
                  </h1>
                  <p className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
                    جميع جلسات التوافق ونتائج التوافق
                  </p>
                </div>
              </div>
            )}
          </div>
          
          <Link to="/">
            <Button className={`${dark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-200 hover:bg-gray-300'}`}>
              <Home className="w-4 h-4 mr-2" />
              الصفحة الرئيسية
            </Button>
          </Link>
        </div>

        {/* Content */}
        <div className={`rounded-2xl shadow-xl ${dark ? 'bg-slate-800/95 backdrop-blur-sm' : 'bg-white'} p-3 sm:p-6`}>
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
              {resultsData.history.map((match: MatchResult, index: number) => {
                const status = getMatchStatusText(match)
                const StatusIcon = status.icon
                const isExpanded = expandedMatches[index]
                
                return (
                  <div key={index} className={`rounded-xl border transition-all duration-200 ${
                    dark ? 'bg-slate-700/40 border-slate-600/50 hover:bg-slate-700/60' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}>
                    {/* Collapsible Header */}
                    <div 
                      className="p-4 cursor-pointer"
                      onClick={() => setExpandedMatches(prev => ({ ...prev, [index]: !prev[index] }))}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            dark ? 'bg-cyan-600/20 border-cyan-400' : 'bg-cyan-100 border-cyan-300'
                          }`}>
                            <span className={`font-bold text-sm ${dark ? 'text-cyan-200' : 'text-cyan-700'}`}>
                              #{match.with}
                            </span>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className={`font-bold text-sm sm:text-base truncate ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                                {match.partner_name || 'شريك المحادثة'}
                              </h3>
                              {match.is_repeat_match && (
                                <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                  dark ? 'bg-amber-600/70 text-amber-200' : 'bg-amber-200/70 text-amber-700'
                                }`}>
                                  تكرار
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Status Badge - Enhanced for Mutual Match */}
                              {match.mutual_match ? (
                                <div className="relative">
                                  <span className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full opacity-50 blur-sm animate-pulse"></span>
                                  <span className="relative flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-sm shadow-lg">
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
                      <div className={`px-4 pb-4 border-t ${dark ? 'border-slate-600/50' : 'border-gray-200'}`}>
                        <div className="pt-4 space-y-4">
                          {/* Compatibility Score */}
                          <div className={`p-4 rounded-xl border ${
                            getOriginalScore(match) >= 70 ? 'bg-green-500/5 border-green-500/20' :
                            getOriginalScore(match) >= 50 ? 'bg-yellow-500/5 border-yellow-500/20' :
                            'bg-red-500/5 border-red-500/20'
                          }`}>
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

                          {/* Match Analysis */}
                          <div className={`p-3 rounded-lg ${dark ? 'bg-slate-600/30' : 'bg-white'}`}>
                            {(() => {
                              const formattedReason = formatCompatibilityReason(match.reason || '')
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
                              // Synergy overview for new model
                              const m = formattedReason.metrics
                              const percent = (v: number, max: number) => Math.max(0, Math.min(100, Math.round((v / max) * 100)))
                              const dims = [
                                { label: 'الطاقة والكيمياء', value: m.vibe, max: 20, bar: 'from-purple-500 to-pink-500' },
                                { label: 'نمط الحياة', value: m.lifestyle, max: 15, bar: 'from-cyan-500 to-blue-500' },
                                { label: 'الدعابة/الانفتاح', value: m.humorOpen, max: 15, bar: 'from-amber-500 to-orange-500' },
                                { label: 'التواصل', value: m.communication, max: 10, bar: 'from-indigo-500 to-sky-500' },
                                { label: 'الأهداف/القيم', value: m.intentValues, max: 5, bar: 'from-emerald-500 to-teal-500' },
                              ]
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
                                    <div className={`rounded-lg p-3 ${dark ? 'bg-slate-800/50 border border-slate-700/40' : 'bg-gray-50 border border-gray-200'}`}>
                                      {/* Matrix-like detailed criteria with value/max and % */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {(() => {
                                          const synergyVal = (typeof m.synergyScore === 'number' && m.synergyScore > 0) ? m.synergyScore : (typeof match.synergy_score === 'number' ? match.synergy_score : 0)
                                          const vibeVal = (typeof m.vibe === 'number' && m.vibe > 0) ? m.vibe : (typeof match.vibe_compatibility_score === 'number' ? match.vibe_compatibility_score : 0)
                                          const lifestyleVal = (typeof m.lifestyle === 'number' && m.lifestyle > 0) ? m.lifestyle : (typeof match.lifestyle_compatibility_score === 'number' ? match.lifestyle_compatibility_score : 0)
                                          const humorOpenVal = (typeof m.humorOpen === 'number' && m.humorOpen > 0) ? m.humorOpen : (typeof match.humor_open_score === 'number' ? match.humor_open_score : 0)
                                          const communicationVal = (typeof m.communication === 'number' && m.communication > 0) ? m.communication : (typeof match.communication_compatibility_score === 'number' ? match.communication_compatibility_score : 0)
                                          const intentVal = (typeof m.intentValues === 'number' && m.intentValues > 0) ? m.intentValues : (typeof match.intent_score === 'number' ? match.intent_score : 0)
                                          const synergyMax = m.synergyMax || 35
                                          const items = [
                                            { label: 'التفاعل', value: synergyVal, max: synergyMax, bar: 'from-emerald-500 to-teal-500' },
                                            { label: 'الطاقة', value: vibeVal, max: 20, bar: 'from-purple-500 to-pink-500' },
                                            { label: 'نمط الحياة', value: lifestyleVal, max: 15, bar: 'from-cyan-500 to-blue-500' },
                                            { label: 'الدعابة/الانفتاح', value: humorOpenVal, max: 15, bar: 'from-amber-500 to-orange-500' },
                                            { label: 'التواصل', value: communicationVal, max: 10, bar: 'from-indigo-500 to-sky-500' },
                                            { label: 'الأهداف', value: intentVal, max: 5, bar: 'from-emerald-500 to-teal-500' }
                                          ]
                                          return items.map(({ label, value, max, bar }, i) => {
                                            const safeMax = max || 1
                                            const raw = typeof value === 'number' ? value : 0
                                            const score = Math.round(raw)
                                            const pct = Math.max(0, Math.min(100, Math.round((score / safeMax) * 100)))
                                            const pctColor = pct >= 80 ? 'text-emerald-400' : pct >= 70 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : pct >= 40 ? 'text-orange-400' : 'text-red-400'
                                            return (
                                              <div key={i} className={`rounded-md p-2 ${dark ? 'bg-slate-900/40 border border-slate-700/40' : 'bg-white border border-gray-200'}`}>
                                                <div className="flex items-center justify-between mb-1">
                                                  <span className={`text-[11px] font-semibold ${dark ? 'text-slate-200' : 'text-gray-800'}`}>{label}</span>
                                                  <div className="flex items-center gap-2">
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
                                        className={`p-2 rounded-lg border ${component.bgColor} ${component.borderColor} backdrop-blur-sm`}
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

                          {/* AI Vibe Analysis Button (if exists) */}
                          {match.ai_personality_analysis && (
                            <div>
                              <Button
                                onClick={() => setShowAiAnalysis(prev => ({ ...prev, [index]: !prev[index] }))}
                                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm"
                              >
                                <Sparkles className="w-4 h-4 ml-2" />
                                {showAiAnalysis[index] ? "إخفاء التحليل الذكي" : "اكتشف سبب توافقكما الرائع!"}
                              </Button>
                              
                              {showAiAnalysis[index] && (
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
                            <div className={`p-3 rounded-lg border ${
                              dark ? 'bg-emerald-500/10 border-emerald-400/30' : 'bg-emerald-50 border-emerald-200'
                            }`}>
                              <div className="flex items-center gap-2 mb-2">
                                <Handshake className={`w-4 h-4 ${dark ? 'text-emerald-200' : 'text-emerald-700'}`} />
                                <h4 className={`font-bold text-sm ${dark ? 'text-emerald-200' : 'text-emerald-700'}`}>
                                  معلومات التواصل - مطابقة متبادلة!
                                </h4>
                              </div>
                              <div className="space-y-1 text-sm">
                                {match.partner_name && (
                                  <div className={`flex items-center gap-2 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                                    <User className="w-3 h-3" />
                                    <span>الاسم: </span>
                                    <span className="font-bold">{match.partner_name}</span>
                                  </div>
                                )}
                                {match.partner_age && (
                                  <div className={`flex items-center gap-2 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                                    <Users className="w-3 h-3" />
                                    <span>العمر: </span>
                                    <span className="font-bold">{match.partner_age}</span>
                                  </div>
                                )}
                                {match.partner_phone && (
                                  <div className={`flex items-center gap-2 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                                    <Phone className="w-3 h-3" />
                                    <span>الهاتف: </span>
                                    <span className="font-bold">{match.partner_phone}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Partner Message (if exists) */}
                          {match.partner_message && (
                            <div className={`p-3 rounded-lg border ${
                              dark ? 'bg-purple-500/10 border-purple-400/30' : 'bg-purple-50 border-purple-200'
                            }`}>
                              <div className="flex items-center gap-2 mb-2">
                                <MessageCircle className={`w-4 h-4 ${dark ? 'text-purple-200' : 'text-purple-700'}`} />
                                <h4 className={`font-bold text-sm ${dark ? 'text-purple-200' : 'text-purple-700'}`}>
                                  رسالة من شريك المحادثة
                                </h4>
                              </div>
                              
                              {!showPartnerMessage[match.round] ? (
                                <div className="text-center">
                                  <p className={`text-xs mb-3 ${dark ? 'text-purple-300/80' : 'text-purple-600/80'}`}>
                                    شريك المحادثة أرسل لك رسالة
                                  </p>
                                  <Button
                                    onClick={() => setShowPartnerMessage(prev => ({ ...prev, [match.round]: true }))}
                                    className="text-xs px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white"
                                  >
                                    اضغط لقراءة الرسالة
                                  </Button>
                                </div>
                              ) : (
                                <div className={`p-3 rounded-lg ${
                                  dark ? 'bg-slate-800/50' : 'bg-white/50'
                                }`}>
                                  <p className={`text-sm leading-relaxed ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                                    "{match.partner_message}"
                                  </p>
                                  <Button
                                    onClick={() => setShowPartnerMessage(prev => ({ ...prev, [match.round]: false }))}
                                    className={`mt-2 text-xs px-2 py-1 ${
                                      dark 
                                        ? 'bg-slate-600 hover:bg-slate-700 text-slate-200' 
                                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                    }`}
                                  >
                                    إخفاء الرسالة
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
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
