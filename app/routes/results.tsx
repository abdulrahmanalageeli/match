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
  
  // Helper function to calculate original score (before bonus)
  const getOriginalScore = (match: MatchResult): number => {
    if (!match.humor_early_openness_bonus || match.humor_early_openness_bonus === 'none') {
      return match.score
    }
    const multiplier = match.humor_early_openness_bonus === 'full' ? 1.15 : 1.05
    return Math.round(match.score / multiplier)
  }

  // Function to convert technical compatibility reason to natural Arabic description
  const formatCompatibilityReason = (reason: string): { components: Array<{ name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }>; originalReason: string } => {
    try {
      if (!reason || typeof reason !== 'string') return { components: [], originalReason: "معلومات التوافق غير متوفرة" }
      
      // Extract scores from the technical format
      const mbtiMatch = reason.match(/MBTI:.*?\((\d+)%\)/)
      const attachmentMatch = reason.match(/التعلق:.*?\((\d+)%\)/)
      const communicationMatch = reason.match(/التواصل:.*?\((\d+)%\)/)
      const lifestyleMatch = reason.match(/نمط الحياة:.*?\((\d+)%\)/)
      const coreValuesMatch = reason.match(/القيم الأساسية:.*?\((\d+)%\)/)
      const vibeMatch = reason.match(/التوافق الشخصي:.*?\((\d+)%\)/)
      
      const mbtiScore = mbtiMatch ? parseInt(mbtiMatch[1]) || 0 : 0
      const attachmentScore = attachmentMatch ? parseInt(attachmentMatch[1]) || 0 : 0
      const communicationScore = communicationMatch ? parseInt(communicationMatch[1]) || 0 : 0
      const lifestyleScore = lifestyleMatch ? parseInt(lifestyleMatch[1]) || 0 : 0
      const coreValuesScore = coreValuesMatch ? parseInt(coreValuesMatch[1]) || 0 : 0
      const vibeScore = vibeMatch ? parseInt(vibeMatch[1]) || 0 : 0
    
    // Helper function to get strength level and color
    const getStrengthLevel = (score: number, maxScore: number) => {
      const percentage = (score / maxScore) * 100
      if (percentage >= 80) return { level: "ممتاز", color: "text-emerald-400", bgColor: "bg-emerald-500/20", borderColor: "border-emerald-400/30" }
      if (percentage >= 60) return { level: "جيد", color: "text-blue-400", bgColor: "bg-blue-500/20", borderColor: "border-blue-400/30" }
      if (percentage >= 40) return { level: "متوسط", color: "text-yellow-400", bgColor: "bg-yellow-500/20", borderColor: "border-yellow-400/30" }
      if (percentage >= 20) return { level: "ضعيف", color: "text-orange-400", bgColor: "bg-orange-500/20", borderColor: "border-orange-400/30" }
      return { level: "منخفض", color: "text-red-400", bgColor: "bg-red-500/20", borderColor: "border-red-400/30" }
    }
    
    // Get strength levels for each component (using actual max scores from trigger-match.mjs)
    const mbtiStrength = getStrengthLevel(mbtiScore, 5)
    const attachmentStrength = getStrengthLevel(attachmentScore, 5)
    const communicationStrength = getStrengthLevel(communicationScore, 25)
    const lifestyleStrength = getStrengthLevel(lifestyleScore, 20)
    const coreValuesStrength = getStrengthLevel(coreValuesScore, 10)
    const vibeStrength = getStrengthLevel(vibeScore, 35)
    
    // Create natural language description
    const components = []
    
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
    
    return { components, originalReason: reason }
    } catch (error) {
      console.error("Error in formatCompatibilityReason:", error)
      return { components: [], originalReason: "معلومات التوافق غير متوفرة" }
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
                              <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${
                                dark ? `${status.bgColor}/20 ${status.color}` : `${status.bgColor} ${status.color}`
                              }`}>
                                <StatusIcon className="w-3 h-3" />
                                {status.text}
                              </span>
                              
                              <div className="flex items-center gap-1">
                                <Award className={`w-3 h-3 ${
                                  getOriginalScore(match) >= 70 ? 'text-green-500' :
                                  getOriginalScore(match) >= 50 ? 'text-yellow-500' :
                                  'text-red-500'
                                }`} />
                                <span className={`text-xs font-bold ${
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
                            <Heart className="w-4 h-4 text-red-500 animate-pulse" />
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
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <span className={`font-semibold text-sm ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                                درجة التوافق الإجمالية
                              </span>
                              <span className={`font-bold text-lg ${
                                getOriginalScore(match) >= 70 ? 'text-green-500' :
                                getOriginalScore(match) >= 50 ? 'text-yellow-500' :
                                getOriginalScore(match) >= 30 ? 'text-orange-500' :
                                'text-red-500'
                              }`}>
                                {getOriginalScore(match)}%
                              </span>
                            </div>
                            <div className={`w-full h-3 rounded-full ${dark ? 'bg-slate-600' : 'bg-gray-200'}`}>
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
                              
                              return (
                                <div className="space-y-3">
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
