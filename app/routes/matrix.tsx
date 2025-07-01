import React, { useEffect, useState } from "react"
import { UserRound, Zap, Info, Gauge } from "lucide-react"

interface MatchResult {
  with: string
  type: string
  reason: string
  score: number
}

export default function MatrixPage() {
  const [assignedNumber, setAssignedNumber] = useState("")
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [loading, setLoading] = useState(false)

  const fetchMatches = async () => {
    if (!assignedNumber) return
    setLoading(true)
    try {
      const res = await fetch("/api/get-my-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_number: Number(assignedNumber) }),
      })
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
    fetchMatches()
  }, [])

  const getCardColor = (score: number) => {
    if (score >= 85) return "border-green-400 bg-green-50"
    if (score >= 60) return "border-yellow-400 bg-yellow-50"
    return "border-gray-300 bg-white"
  }

  return (
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-center">🤖 نتائج التوافق</h1>

        <input
          type="number"
          value={assignedNumber}
          onChange={(e) => setAssignedNumber(e.target.value)}
          placeholder="أدخل رقم المشارك"
          className="w-full p-3 rounded border border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
        />

        <button
          onClick={fetchMatches}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-semibold"
          disabled={!assignedNumber}
        >
          عرض النتائج
        </button>

        {loading ? (
          <p className="text-center text-gray-500">⏳ جاري التحميل...</p>
        ) : matches.length === 0 && assignedNumber ? (
          <p className="text-center text-red-500">لا توجد نتائج توافق لهذا الرقم.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {matches.map((match, i) => (
              <div
                key={i}
                className={`p-4 rounded-lg shadow-md border hover:shadow-lg transition-all ${getCardColor(match.score)}`}
              >
                <div className="flex items-center gap-2 text-blue-700 font-bold text-lg mb-1">
                  <UserRound className="w-5 h-5" /> مع: #{match.with}
                </div>
                <div className="text-sm text-gray-600 mb-1 flex items-center gap-1">
                  <Zap className="w-4 h-4 text-yellow-500" /> نوع التوافق: {match.type || "غير محدد"}
                </div>
                <div className="text-sm text-blue-700 mb-1 flex items-center gap-1">
                  <Gauge className="w-4 h-4" /> نسبة التوافق: {match.score}%
                </div>
                <div className="text-sm text-gray-700 italic flex gap-1 items-start">
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