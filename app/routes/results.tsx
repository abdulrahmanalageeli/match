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
  Home
} from "lucide-react"
import { Button } from "../../components/ui/button"

interface MatchResult {
  with: number | string
  partner_name?: string
  partner_age?: number | null
  partner_phone?: string | null
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
}

interface ResultsData {
  assigned_number: number
  history: MatchResult[]
}

export default function ResultsPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resultsData, setResultsData] = useState<ResultsData | null>(null)
  const [dark] = useState(true) // Match the welcome page theme

  useEffect(() => {
    const fetchResults = async () => {
      if (!token) {
        setError("لم يتم توفير رمز صحيح")
        setLoading(false)
        return
      }

      try {
        const res = await fetch("/api/participant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get-match-results", secure_token: token }),
        })
        
        const data = await res.json()
        
        if (data.success) {
          setResultsData({
            assigned_number: data.assigned_number,
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
      <div className={`min-h-screen ${dark ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-br from-blue-50 to-indigo-100'}`}>
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
    <div className={`min-h-screen ${dark ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-br from-blue-50 to-indigo-100'}`}>
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
          {error ? (
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
                    <div className="mb-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className={`font-semibold text-sm ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                          درجة التوافق
                        </span>
                        <span className={`font-bold ${
                          match.score >= 80 ? 'text-green-500' :
                          match.score >= 60 ? 'text-yellow-500' :
                          match.score >= 40 ? 'text-orange-500' :
                          'text-red-500'
                        }`}>
                          {match.score}%
                        </span>
                      </div>
                      <div className={`w-full h-2 rounded-full ${dark ? 'bg-slate-600' : 'bg-gray-200'}`}>
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

                    {/* Match Analysis */}
                    <div className={`p-3 rounded-lg ${dark ? 'bg-slate-600/30' : 'bg-white'}`}>
                      <h4 className={`font-semibold text-sm mb-1 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                        تحليل التوافق
                      </h4>
                      <p className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
                        {match.reason || 'لا يوجد تحليل متوفر'}
                      </p>
                    </div>

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
