import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { AlertTriangle, Heart, X, Clock, User, Phone, Calendar, ArrowLeft, Search, Handshake } from "lucide-react"

interface MatchResult {
  with: number | string
  partner_name?: string
  partner_age?: number | null
  partner_phone?: string | null
  type: string
  reason: string
  round: number
  table_number: number | null
  score: number
  is_repeat_match?: boolean
  mutual_match?: boolean
  wants_match?: boolean | null
  partner_wants_match?: boolean | null
  created_at?: string
}

export default function MatchResults() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  const [dark] = useState(true) // You can implement theme detection here
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [participantData, setParticipantData] = useState<{
    assigned_number: number
    history: MatchResult[]
  } | null>(null)

  useEffect(() => {
    const fetchResults = async () => {
      if (!token) {
        setError("الرمز المميز مطلوب")
        setLoading(false)
        return
      }

      try {
        const res = await fetch("/api/participant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve-token", secure_token: token }),
        })
        
        const data = await res.json()
        
        if (data.success && data.history) {
          setParticipantData({
            assigned_number: data.assigned_number,
            history: data.history
          })
        } else {
          setError("لم يتم العثور على بيانات المشارك أو الرمز غير صحيح")
        }
      } catch (err) {
        setError("حدث خطأ أثناء جلب البيانات")
      } finally {
        setLoading(false)
      }
    }

    fetchResults()
  }, [token])

  const formatCompatibilityReason = (reason: string) => {
    // Simple formatting - you can enhance this
    return { originalReason: reason, components: [] }
  }

  const getMatchStatusText = (match: MatchResult) => {
    if (match.wants_match === null || match.partner_wants_match === null) {
      return { text: "في الانتظار", color: "text-yellow-500", bgColor: "bg-yellow-100", icon: Clock }
    }
    
    if (match.mutual_match) {
      return { text: "مطابقة متبادلة!", color: "text-emerald-500", bgColor: "bg-emerald-100", icon: Heart }
    }
    
    if (match.wants_match === false || match.partner_wants_match === false) {
      return { text: "لا توجد مطابقة", color: "text-red-500", bgColor: "bg-red-100", icon: X }
    }
    
    return { text: "في الانتظار", color: "text-yellow-500", bgColor: "bg-yellow-100", icon: Clock }
  }

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={dark ? "text-slate-300" : "text-gray-600"}>جاري تحميل النتائج...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className={`max-w-md w-full mx-4 p-8 rounded-2xl shadow-2xl ${dark ? 'bg-slate-800' : 'bg-white'}`}>
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className={`text-xl font-bold text-center mb-4 ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
            خطأ في تحميل البيانات
          </h2>
          <p className={`text-center mb-6 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{error}</p>
          <div className="flex justify-center">
            <button
              onClick={() => window.location.href = '/welcome'}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              العودة للصفحة الرئيسية
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!participantData || !participantData.history.length) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className={`max-w-md w-full mx-4 p-8 rounded-2xl shadow-2xl ${dark ? 'bg-slate-800' : 'bg-white'}`}>
          <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className={`text-xl font-bold text-center mb-4 ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
            لا توجد نتائج مطابقة
          </h2>
          <p className={`text-center mb-6 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
            لم تشارك في أي جلسات مطابقة بعد، أو لم تكتمل النتائج.
          </p>
          <div className="flex justify-center">
            <button
              onClick={() => window.location.href = '/welcome'}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              العودة للصفحة الرئيسية
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${dark ? 'bg-slate-900' : 'bg-gray-50'}`}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className={`rounded-2xl p-6 mb-8 shadow-2xl ${dark ? 'bg-slate-800' : 'bg-white'}`}>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => window.location.href = '/welcome'}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${dark ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'}`}
            >
              <ArrowLeft className="w-4 h-4" />
              العودة
            </button>
            
            <div className="text-center">
              <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center mx-auto mb-2 ${
                dark ? 'bg-blue-600/20 border-blue-400' : 'bg-blue-100 border-blue-300'
              }`}>
                <span className={`text-2xl font-bold ${dark ? 'text-blue-200' : 'text-blue-700'}`}>
                  #{participantData.assigned_number}
                </span>
              </div>
            </div>
            
            <div className="w-16"></div> {/* Spacer for centering */}
          </div>
          
          <h1 className={`text-2xl font-bold text-center ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
            نتائج المطابقة
          </h1>
          <p className={`text-center mt-2 ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
            جميع جلسات المطابقة ونتائج التوافق
          </p>
        </div>

        {/* Match Results */}
        <div className="space-y-6">
          {participantData.history.map((match, index) => {
            const status = getMatchStatusText(match)
            const StatusIcon = status.icon
            
            return (
              <div key={index} className={`rounded-2xl p-6 shadow-2xl ${dark ? 'bg-slate-800' : 'bg-white'}`}>
                {/* Match Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${
                      dark ? 'bg-cyan-600/20 border-cyan-400' : 'bg-cyan-100 border-cyan-300'
                    }`}>
                      <span className={`font-bold ${dark ? 'text-cyan-200' : 'text-cyan-700'}`}>
                        {match.with === "المنظم" ? "المنظم" : `#${match.with}`}
                      </span>
                    </div>
                    <div>
                      <h3 className={`font-bold ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                        الجولة {match.round}
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
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className={`font-semibold ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                      درجة التوافق
                    </span>
                    <span className={`font-bold text-lg ${
                      match.score >= 80 ? 'text-green-500' :
                      match.score >= 60 ? 'text-yellow-500' :
                      match.score >= 40 ? 'text-orange-500' :
                      'text-red-500'
                    }`}>
                      {match.score}%
                    </span>
                  </div>
                  <div className={`w-full h-3 rounded-full ${dark ? 'bg-slate-600' : 'bg-gray-200'}`}>
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        match.score >= 80 ? 'bg-green-500' :
                        match.score >= 60 ? 'bg-yellow-500' :
                        match.score >= 40 ? 'bg-orange-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${match.score}%` }}
                    ></div>
                  </div>
                </div>

                {/* Match Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className={`p-3 rounded-lg ${dark ? 'bg-slate-700/50' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4" />
                      <span className={`text-sm font-medium ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                        رقم الطاولة
                      </span>
                    </div>
                    <p className={`font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
                      {match.table_number || 'غير محدد'}
                    </p>
                  </div>
                  
                  <div className={`p-3 rounded-lg ${dark ? 'bg-slate-700/50' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4" />
                      <span className={`text-sm font-medium ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                        تاريخ المطابقة
                      </span>
                    </div>
                    <p className={`font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
                      {match.created_at ? new Date(match.created_at).toLocaleDateString('ar-SA') : 'غير محدد'}
                    </p>
                  </div>
                </div>

                {/* Compatibility Analysis */}
                <div className={`p-4 rounded-lg ${dark ? 'bg-slate-700/30' : 'bg-gray-50'}`}>
                  <h4 className={`font-semibold mb-2 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                    تحليل التوافق
                  </h4>
                  <p className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
                    {match.reason || 'لا يوجد تحليل متوفر'}
                  </p>
                </div>

                {/* Partner Contact Info (if mutual match) */}
                {match.mutual_match && (match.partner_name || match.partner_phone) && (
                  <div className={`mt-4 p-4 rounded-lg border ${
                    dark ? 'bg-emerald-500/10 border-emerald-400/30' : 'bg-emerald-50 border-emerald-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Handshake className={`w-5 h-5 ${dark ? 'text-emerald-200' : 'text-emerald-700'}`} />
                      <h4 className={`font-bold ${dark ? 'text-emerald-200' : 'text-emerald-700'}`}>
                        معلومات التواصل - مطابقة متبادلة!
                      </h4>
                    </div>
                    <div className="space-y-2">
                      {match.partner_name && (
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          <span className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>الاسم:</span>
                          <span className={`font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
                            {match.partner_name}
                          </span>
                        </div>
                      )}
                      {match.partner_age && (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>العمر:</span>
                          <span className={`font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
                            {match.partner_age}
                          </span>
                        </div>
                      )}
                      {match.partner_phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          <span className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>الهاتف:</span>
                          <span className={`font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
                            {match.partner_phone}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <button
            onClick={() => window.location.href = '/welcome'}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    </div>
  )
}
