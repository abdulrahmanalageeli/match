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

  useEffect(() => {
    fetchAllMatches()
  }, [])

  const getCardColor = (score: number) => {
    if (score >= 85) return "border-green-500 bg-green-50"
    if (score >= 60) return "border-yellow-500 bg-yellow-50"
    return "border-gray-300 bg-white"
  }

  return (
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-4xl font-bold text-center text-blue-700">📊 نتائج التوافق بين الجميع</h1>

        {loading ? (
          <p className="text-center text-gray-500 text-lg">⏳ جاري تحميل جميع النتائج...</p>
        ) : matches.length === 0 ? (
          <p className="text-center text-red-500 text-lg">لا توجد نتائج توافق لعرضها حالياً.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {matches.map((match, i) => (
              <div
                key={i}
                className={`p-5 rounded-xl shadow-md border-2 transition-all hover:shadow-lg ${getCardColor(match.score)}`}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="text-blue-800 font-semibold flex items-center gap-1">
                    <UserRound className="w-5 h-5" /> #{match.with} × #{match.partner}
                  </div>
                  <div className="text-sm text-gray-600 italic">{match.type}</div>
                </div>

                <div className="text-sm text-blue-800 font-medium flex items-center gap-1 mb-1">
                  <Gauge className="w-4 h-4" /> نسبة التوافق: {match.score}%
                </div>

                <div className="text-sm text-gray-700 flex gap-1 items-start mt-2">
                  <Info className="w-4 h-4 text-gray-400 mt-0.5" />
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
