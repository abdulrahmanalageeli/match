import React, { useEffect, useState } from "react"
import { UserRound, Info, Gauge, ChevronDown, ChevronUp, Search, Star } from "lucide-react"

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
  const [expandedRounds, setExpandedRounds] = useState<Record<number, boolean>>({})
  const [scoreFilter, setScoreFilter] = useState(0)
  const [search, setSearch] = useState("")

  useEffect(() => {
    const fetchAllMatches = async () => {
      setLoading(true)
      try {
        const res = await fetch("/api/get-my-matches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "all-matches" })
        })
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

  // Filtering and searching
  const filteredGrouped = Object.fromEntries(
    Object.entries(grouped).map(([roundStr, group]) => [
      roundStr,
      group
        .filter(m => m.score >= scoreFilter)
        .filter(m =>
          search.trim() === "" ||
          m.with.includes(search) ||
          m.partner.includes(search)
        )
        .sort((a, b) => b.score - a.score)
    ])
  )

  // Function to convert technical compatibility reason to natural Arabic description
  const formatCompatibilityReason = (reason: string): { components: Array<{ name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }>; originalReason: string } => {
    if (!reason) return { components: [], originalReason: "معلومات التوافق غير متوفرة" }
    
    // Extract scores from the technical format
    const mbtiMatch = reason.match(/MBTI:.*?\((\d+)%\)/)
    const attachmentMatch = reason.match(/التعلق:.*?\((\d+)%\)/)
    const communicationMatch = reason.match(/التواصل:.*?\((\d+)%\)/)
    const lifestyleMatch = reason.match(/نمط الحياة:.*?\((\d+)%\)/)
    const coreValuesMatch = reason.match(/القيم الأساسية:.*?\((\d+)%\)/)
    const vibeMatch = reason.match(/التوافق الشخصي:.*?\((\d+)%\)/)
    
    const mbtiScore = mbtiMatch ? parseInt(mbtiMatch[1]) : 0
    const attachmentScore = attachmentMatch ? parseInt(attachmentMatch[1]) : 0
    const communicationScore = communicationMatch ? parseInt(communicationMatch[1]) : 0
    const lifestyleScore = lifestyleMatch ? parseInt(lifestyleMatch[1]) : 0
    const coreValuesScore = coreValuesMatch ? parseInt(coreValuesMatch[1]) : 0
    const vibeScore = vibeMatch ? parseInt(vibeMatch[1]) : 0
    
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
        name: "التوافق الشخصي",
        strength: mbtiStrength.level,
        color: mbtiStrength.color,
        bgColor: mbtiStrength.bgColor,
        borderColor: mbtiStrength.borderColor,
        description: mbtiScore >= 7 ? "شخصيات متكاملة ومتوافقة" : 
                    mbtiScore >= 5 ? "شخصيات متوازنة" : 
                    "شخصيات مختلفة ومكملة"
      })
    }
    
    if (attachmentScore > 0) {
      components.push({
        name: "أسلوب التعلق",
        strength: attachmentStrength.level,
        color: attachmentStrength.color,
        bgColor: attachmentStrength.bgColor,
        borderColor: attachmentStrength.borderColor,
        description: attachmentScore >= 12 ? "أنماط تعلق متوافقة ومستقرة" : 
                    attachmentScore >= 8 ? "أنماط تعلق متوازنة" : 
                    "أنماط تعلق مختلفة ومكملة"
      })
    }
    
    if (communicationScore > 0) {
      components.push({
        name: "أسلوب التواصل",
        strength: communicationStrength.level,
        color: communicationStrength.color,
        bgColor: communicationStrength.bgColor,
        borderColor: communicationStrength.borderColor,
        description: communicationScore >= 20 ? "تواصل ممتاز ومتناغم" : 
                    communicationScore >= 15 ? "تواصل جيد ومتوازن" : 
                    "تواصل مختلف ومكمل"
      })
    }
    
    if (lifestyleScore > 0) {
      components.push({
        name: "نمط الحياة",
        strength: lifestyleStrength.level,
        color: lifestyleStrength.color,
        bgColor: lifestyleStrength.bgColor,
        borderColor: lifestyleStrength.borderColor,
        description: lifestyleScore >= 12 ? "أنماط حياة متوافقة" : 
                    lifestyleScore >= 8 ? "أنماط حياة متوازنة" : 
                    "أنماط حياة مختلفة ومكملة"
      })
    }
    
    if (coreValuesScore > 0) {
      components.push({
        name: "القيم الأساسية",
        strength: coreValuesStrength.level,
        color: coreValuesStrength.color,
        bgColor: coreValuesStrength.bgColor,
        borderColor: coreValuesStrength.borderColor,
        description: coreValuesScore >= 16 ? "قيم متطابقة ومتناغمة" : 
                    coreValuesScore >= 12 ? "قيم متوازنة" : 
                    "قيم مختلفة ومكملة"
      })
    }
    
    if (vibeScore > 0) {
      components.push({
        name: "التوافق الشخصي",
        strength: vibeStrength.level,
        color: vibeStrength.color,
        bgColor: vibeStrength.bgColor,
        borderColor: vibeStrength.borderColor,
        description: vibeScore >= 12 ? "كيمياء شخصية ممتازة" : 
                    vibeScore >= 8 ? "كيمياء شخصية جيدة" : 
                    "كيمياء شخصية متوازنة"
      })
    }
    
    return { components, originalReason: reason }
  }

  // UI helpers
  const toggleRound = (round: number) => {
    setExpandedRounds(prev => ({ ...prev, [round]: !prev[round] }))
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-10 px-2 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-center text-cyan-300 drop-shadow mb-8">💎 مصفوفة التوافق التفاعلية</h1>
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-8 bg-slate-800/60 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Search className="w-5 h-5 text-cyan-400" />
            <input
              type="text"
              placeholder="بحث برقم المشارك..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="rounded-lg px-3 py-2 bg-slate-900/60 text-cyan-100 placeholder-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 w-full md:w-56"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-cyan-200 text-sm">فلترة حسب التوافق:</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={scoreFilter}
              onChange={e => setScoreFilter(Number(e.target.value))}
              className="accent-cyan-400 w-32"
            />
            <span className="text-cyan-300 font-bold text-lg">{scoreFilter}%+</span>
          </div>
        </div>
        {loading ? (
          <p className="text-center text-cyan-200 text-lg animate-pulse">⏳ جاري تحميل جميع النتائج...</p>
        ) : matches.length === 0 ? (
          <p className="text-center text-red-400 text-lg">لا توجد نتائج توافق لعرضها حالياً.</p>
        ) : (
          Object.entries(filteredGrouped).map(([roundStr, group], idx) => {
            const round = Number(roundStr)
            const isOpen = expandedRounds[round] ?? idx === 0 // open first by default
            // Find top match for this round
            const topScore = group.length > 0 ? group[0].score : 0
            return (
              <div key={round} className="rounded-2xl bg-slate-800/70 shadow-xl mb-6 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 bg-slate-900/70 hover:bg-slate-900/90 transition text-cyan-200 text-xl font-bold border-b border-slate-700 focus:outline-none"
                  onClick={() => toggleRound(round)}
                >
                  <span>الجولة {round > 0 ? round : "?"}</span>
                  {isOpen ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                </button>
                <div className={`transition-all duration-500 ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                    {group.length === 0 ? (
                      <p className="text-cyan-300 col-span-full">لا توجد نتائج بهذه الفلترة.</p>
                    ) : (
                      group.map((match, i) => {
                        const isTop = match.score === topScore && match.score > 0
                        return (
                          <div
                            key={i}
                            className={`relative bg-gradient-to-br from-slate-900/80 to-slate-800/80 border-2 rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col justify-between h-full group ${isTop ? 'border-cyan-400 shadow-cyan-400/30 animate-pulse-slow' : 'border-slate-700'}`}
                          >
                            {/* Top match badge */}
                            {isTop && (
                              <div className="absolute -top-3 -left-3 bg-cyan-400 text-white rounded-full px-3 py-1 text-xs font-bold shadow-lg flex items-center gap-1 animate-bounce">
                                <Star className="w-4 h-4" /> الأعلى
                              </div>
                            )}
                            {/* Layer 1: Names and type */}
                            <div className="flex items-center justify-between mb-3 text-sm text-cyan-200">
                              <div className="flex items-center gap-1">
                                <UserRound className="w-4 h-4 text-cyan-300" />
                                <span>#{match.with} × #{match.partner}</span>
                              </div>
                              <span className={`text-xs rounded px-2 py-0.5 ${match.type === 'مقابلة فردية' ? 'bg-cyan-700/30 text-cyan-200' : 'bg-pink-700/30 text-pink-200'}`}>{match.type}</span>
                            </div>
                            {/* Layer 2: Score with animated bar */}
                            <div className="flex flex-col items-center justify-center mb-2">
                              <div className="flex items-center gap-2">
                                <Gauge className="w-5 h-5 text-cyan-400" />
                                <span className="text-3xl font-extrabold text-cyan-300 drop-shadow">{match.score}%</span>
                              </div>
                              <div className="w-full h-3 bg-slate-700 rounded-full mt-2 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ${
                                    match.score >= 80 ? 'bg-green-400' :
                                    match.score >= 60 ? 'bg-yellow-400' :
                                    match.score >= 40 ? 'bg-orange-400' :
                                    'bg-red-400'
                                  }`}
                                  style={{ width: `${match.score}%` }}
                                ></div>
                              </div>
                            </div>
                            {/* Table number */}
                            {typeof match.table_number === "number" && (
                              <p className="text-xs text-center text-cyan-400 mb-2">طاولة رقم {match.table_number}</p>
                            )}
                            {/* Expandable reason */}
                            <details className="mt-auto group-hover:open:animate-fade-in">
                              <summary className="flex items-center gap-2 cursor-pointer text-cyan-200 text-sm font-bold select-none">
                                <Info className="w-4 h-4 text-cyan-400" /> تحليل التوافق
                              </summary>
                              <div className="mt-2 bg-slate-900/60 rounded-lg p-3 border border-slate-700 shadow-inner">
                                {(() => {
                                  const formattedReason = formatCompatibilityReason(match.reason)
                                  return (
                                    <div className="space-y-2">
                                      {formattedReason.components.map((component: { name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }, index: number) => (
                                        <div 
                                          key={index}
                                          className={`p-2 rounded-lg border ${component.bgColor} ${component.borderColor} backdrop-blur-sm`}
                                        >
                                          <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-semibold text-cyan-200">
                                              {component.name}
                                            </span>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${component.color} ${component.bgColor}`}>
                                              {component.strength}
                                            </span>
                                          </div>
                                          <p className="text-xs text-cyan-100">
                                            {component.description}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  )
                                })()}
                              </div>
                            </details>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
