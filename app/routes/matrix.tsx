import React, { useEffect, useState } from "react"
import { UserRound, Zap, Info, Gauge } from "lucide-react"

interface MatchResult {
  with: string
  partner: string
  score: number
  type: string
  reason: string
}

export default function MatrixPage() {
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchAllMatches = async () => {
      setLoading(true)
      try {
        const res = await fetch("/api/get-my-matches", { method: "POST" })
        const data = await res.json()
        const sorted = (data.matches || []).sort((a: MatchResult, b: MatchResult) => b.score - a.score)
        setMatches(sorted)
      } catch (err) {
        console.error("Error fetching matches:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchAllMatches()
  }, [])

  const getGradient = (score: number) => {
    if (score >= 85) return "from-green-200 via-green-100 to-white"
    if (score >= 70) return "from-yellow-200 via-yellow-100 to-white"
    if (score >= 50) return "from-orange-200 via-orange-100 to-white"
    return "from-gray-200 via-gray-100 to-white"
  }

  return (
    <div dir="rtl" className="min-h-screen bg-neutral-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <h1 className="text-4xl font-extrabold text-center text-blue-700">📊 نتائج التوافق بين الجميع</h1>

        {loading ? (
          <p className="text-center text-gray-500 text-lg">⏳ جاري تحميل جميع النتائج...</p>
        ) : matches.length === 0 ? (
          <p className="text-center text-red-500 text-lg">لا توجد نتائج توافق لعرضها حالياً.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {matches.map((match, i) => (
              <div
                key={i}
                className={`bg-gradient-to-br ${getGradient(match.score)} border border-gray-200 rounded-2xl p-5 shadow hover:shadow-lg transition-all duration-300`}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="text-blue-800 font-semibold flex items-center gap-1 text-lg">
                    <UserRound className="w-5 h-5" />
                    #{match.with} × #{match.partner}
                  </div>
                  <span className="text-sm text-gray-600 font-medium">{match.type}</span>
                </div>

                <div className="text-sm text-blue-900 font-bold flex items-center gap-1 mb-1">
                  <Gauge className="w-4 h-4" />
                  نسبة التوافق: {match.score}%
                </div>

                <div className="text-sm text-gray-800 flex gap-2 items-start mt-2 leading-relaxed">
                  <Info className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                  <span>{match.reason}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
