import React, { useState, useEffect } from "react"
import { useSearchParams, Link } from "react-router-dom"
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
  Sparkles
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
    
    // Get strength levels for each component
    const mbtiStrength = getStrengthLevel(mbtiScore, 10)
    const attachmentStrength = getStrengthLevel(attachmentScore, 15)
    const communicationStrength = getStrengthLevel(communicationScore, 25)
    const lifestyleStrength = getStrengthLevel(lifestyleScore, 15)
    const coreValuesStrength = getStrengthLevel(coreValuesScore, 20)
    const vibeStrength = getStrengthLevel(vibeScore, 15)
    
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
        description: attachmentScore >= 12 ? "أنماط تعلق متوافقة ومستقرة - نهج متشابه في بناء العلاقات والثقة المتبادلة يخلق بيئة آمنة ومريحة للتواصل العميق" : 
                    attachmentScore >= 8 ? "أنماط تعلق متوازنة - اختلافات بسيطة في احتياجات الأمان العاطفي قابلة للتفهم والتكيف المتبادل" : 
                    "أنماط تعلق مختلفة ومكملة - تنوع في احتياجات القرب والاستقلالية يتطلب تفهماً وصبراً لبناء توازن صحي"
      })
    }
    
    if (communicationScore > 0) {
      components.push({
        name: "أسلوب التواصل",
        strength: communicationStrength.level,
        color: communicationStrength.color,
        bgColor: communicationStrength.bgColor,
        borderColor: communicationStrength.borderColor,
        description: communicationScore >= 20 ? "تواصل ممتاز ومتناغم - أساليب تعبير متشابهة وفهم سريع للإشارات غير اللفظية يسهل الحوارات العميقة والمثمرة" : 
                    communicationScore >= 15 ? "تواصل جيد ومتوازن - اختلافات طفيفة في أساليب التعبير مع قدرة جيدة على التفاهم والتكيف مع بعضكما البعض" : 
                    "تواصل مختلف ومكمل - تنوع في طرق التعبير والاستماع يحتاج لصبر وتفهم لكنه يثري التجربة بوجهات نظر متنوعة"
      })
    }
    
    if (lifestyleScore > 0) {
      components.push({
        name: "نمط الحياة",
        strength: lifestyleStrength.level,
        color: lifestyleStrength.color,
        bgColor: lifestyleStrength.bgColor,
        borderColor: lifestyleStrength.borderColor,
        description: lifestyleScore >= 12 ? "أنماط حياة متوافقة - إيقاع حياة متشابه واهتمامات مشتركة تسهل التخطيط المشترك وقضاء وقت ممتع ومريح معاً" : 
                    lifestyleScore >= 8 ? "أنماط حياة متوازنة - اختلافات معتدلة في الروتين والاهتمامات مع مساحات مشتركة للاستمتاع والتفاهم" : 
                    "أنماط حياة مختلفة ومكملة - تنوع في الأنشطة والاهتمامات يوفر فرصاً لاكتشاف تجارب جديدة وتوسيع الآفاق"
      })
    }
    
    if (coreValuesScore > 0) {
      components.push({
        name: "القيم الأساسية",
        strength: coreValuesStrength.level,
        color: coreValuesStrength.color,
        bgColor: coreValuesStrength.bgColor,
        borderColor: coreValuesStrength.borderColor,
        description: coreValuesScore >= 16 ? "قيم متطابقة ومتناغمة - رؤية مشتركة للحياة والأولويات تخلق أساساً قوياً للتفاهم في القرارات المهمة والأهداف المستقبلية" : 
                    coreValuesScore >= 12 ? "قيم متوازنة - تشابه في المبادئ الأساسية مع اختلافات طفيفة في التطبيق تثري النقاشات وتوسع المدارك" : 
                    "قيم مختلفة ومكملة - تنوع في المنظور الأخلاقي والأولويات يتطلب حواراً مفتوحاً لكنه يوفر فرصاً للنمو والتعلم"
      })
    }
    
    if (vibeScore > 0) {
      components.push({
        name: "التوافق الشخصي",
        strength: vibeStrength.level,
        color: vibeStrength.color,
        bgColor: vibeStrength.bgColor,
        borderColor: vibeStrength.borderColor,
        description: vibeScore >= 12 ? "كيمياء شخصية ممتازة - انجذاب طبيعي وتناغم في الطاقة والاهتمامات يخلق شعوراً بالراحة والاستمتاع في قضاء الوقت معاً" : 
                    vibeScore >= 8 ? "كيمياء شخصية جيدة - تفاهم جيد وانسجام في الشخصية مع إمكانية تطوير علاقة مريحة وممتعة بمرور الوقت" : 
                    "كيمياء شخصية متوازنة - تفاعل هادئ ومتوازن قد يحتاج لوقت أطول لتطوير الألفة والراحة المتبادلة"
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
          setResultsData({
            assigned_number: data.assigned_number,
            event_id: data.event_id || 1,
            history: data.history || []
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
                    نتائج المطابقة
                  </h1>
                  <p className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
                    جميع جلسات المطابقة ونتائج التوافق
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
        <div className={`rounded-2xl shadow-xl ${dark ? 'bg-slate-800' : 'bg-white'} p-6`}>
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
            <div className="space-y-4">
              {resultsData.history.map((match: MatchResult, index: number) => {
                const status = getMatchStatusText(match)
                const StatusIcon = status.icon
                
                return (
                  <div key={index} className={`rounded-xl p-4 border ${dark ? 'bg-slate-700/30 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                    {/* Match Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
                          dark ? 'bg-cyan-600/20 border-cyan-400' : 'bg-cyan-100 border-cyan-300'
                        }`}>
                          <span className={`font-bold text-sm ${dark ? 'text-cyan-200' : 'text-cyan-700'}`}>
                            {match.with === "المنظم" ? "المنظم" : `#${match.with}`}
                          </span>
                        </div>
                        <div>
                          <h3 className={`font-bold ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                            الجولة الفردية
                          </h3>
                          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
                            {match.type}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {match.is_repeat_match && (
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            dark ? 'bg-amber-600/70 text-amber-200' : 'bg-amber-200/70 text-amber-700'
                          }`}>
                            <AlertTriangle className="w-3 h-3 inline mr-1" />
                            تكرار
                          </span>
                        )}
                        
                        <span className={`text-xs px-3 py-1 rounded-full flex items-center gap-1 ${
                          dark ? `${status.bgColor}/20 ${status.color}` : `${status.bgColor} ${status.color}`
                        }`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.text}
                        </span>
                      </div>
                    </div>

                    {/* Compatibility Score */}
                    <div className="mb-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className={`font-semibold text-sm ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                          درجة التوافق
                        </span>
                        <span className={`font-bold ${
                          match.score >= 70 ? 'text-green-500' :
                          match.score >= 50 ? 'text-yellow-500' :
                          match.score >= 30 ? 'text-orange-500' :
                          'text-red-500'
                        }`}>
                          {match.score}%
                        </span>
                      </div>
                      <div className={`w-full h-2 rounded-full ${dark ? 'bg-slate-600' : 'bg-gray-200'}`}>
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            match.score >= 70 ? 'bg-green-500' :
                            match.score >= 50 ? 'bg-yellow-500' :
                            match.score >= 30 ? 'bg-orange-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${match.score}%` }}
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {formattedReason.components.map((component: { name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }, index: number) => (
                                <div 
                                  key={index}
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
                    {match.ai_personality_analysis && match.with !== "المنظم" && (
                      <div className="mt-3">
                        <Button
                          onClick={() => setShowAiAnalysis(prev => ({ ...prev, [index]: !prev[index] }))}
                          className={`w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white`}
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
                      <div className={`mt-3 p-3 rounded-lg border ${
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
                            <div className={dark ? 'text-slate-200' : 'text-gray-800'}>
                              <span>الاسم: </span>
                              <span className="font-bold">{match.partner_name}</span>
                              {match.partner_event_id && (
                                <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                                  dark ? 'bg-cyan-500/20 text-cyan-300' : 'bg-cyan-100 text-cyan-700'
                                }`}>
                                  الفعالية {match.partner_event_id}
                                </span>
                              )}
                            </div>
                          )}
                          {match.partner_age && (
                            <div className={dark ? 'text-slate-200' : 'text-gray-800'}>
                              <span>العمر: </span>
                              <span className="font-bold">{match.partner_age}</span>
                            </div>
                          )}
                          {match.partner_phone && (
                            <div className={dark ? 'text-slate-200' : 'text-gray-800'}>
                              <span>الهاتف: </span>
                              <span className="font-bold">{match.partner_phone}</span>
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
