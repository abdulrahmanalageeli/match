import React, { useEffect, useState } from "react"
import { UserRound, Info, Gauge } from "lucide-react"

interface MatchResult {
  with: string
  partner: string
  score: number
  type: string
  reason: string
  round?: number
  table_number?: number
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
        const sorted = (data.matches || []).sort(
          (a: MatchResult, b: MatchResult) =>
            (a.round ?? 99) - (b.round ?? 99) || b.score - a.score
        )
        setMatches(sorted)
      } catch (err) {
        console.error("Error fetching matches:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchAllMatches()
  }, [])

  // Group matches by round
  const grouped = matches.reduce((acc, match) => {
    const round = match.round ?? 0
    if (!acc[round]) acc[round] = []
    acc[round].push(match)
    return acc
  }, {} as Record<number, MatchResult[]>)

  return (
    <div dir="rtl" className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-center text-blue-800">📊 نتائج التوافق بين الجميع</h1>

        {loading ? (
          <p className="text-center text-gray-500 text-lg">⏳ جاري تحميل جميع النتائج...</p>
        ) : matches.length === 0 ? (
          <p className="text-center text-red-500 text-lg">لا توجد نتائج توافق لعرضها حالياً.</p>
        ) : (
          Object.entries(grouped).map(([roundStr, group], idx) => {
            const round = Number(roundStr)
            return (
              <div key={round} className="space-y-4">
                <h2 className="text-2xl font-bold text-right text-blue-700 mb-2">
                  الجولة {round > 0 ? round : "?"}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {group.map((match, i) => (
                    <div
                      key={i}
                      className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-full"
                    >
                      {/* Layer 1: Names and type */}
                      <div className="flex items-center justify-between mb-3 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <UserRound className="w-4 h-4 text-gray-500" />
                          <span>#{match.with} × #{match.partner}</span>
                        </div>
                        <span className="text-xs bg-gray-100 rounded px-2 py-0.5">{match.type}</span>
                      </div>

                      {/* Layer 2: Score */}
                      <div className="flex items-center justify-center mb-1">
                        <Gauge className="w-5 h-5 text-blue-600 mr-1" />
                        <span className="text-3xl font-bold text-blue-700">{match.score}%</span>
                      </div>

                      {/* Layer 2.5: Table number */}
                      {typeof match.table_number === "number" && (
                        <p className="text-xs text-center text-gray-500 mb-2">طاولة رقم {match.table_number}</p>
                      )}

                      {/* Layer 3: Reason */}
                      <div className="flex gap-2 text-sm text-gray-700 leading-relaxed mt-auto">
                        <Info className="w-4 h-4 text-gray-400 mt-0.5" />
                        <p className="text-right">{match.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
