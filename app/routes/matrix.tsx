import { useState, useEffect } from "react"
import { UserRound, Info, Gauge, Search, Star, Heart, Users, Trophy, Filter, RefreshCw, ChevronDown, ChevronUp } from "lucide-react"

interface ParticipantMatch {
  id: string
  participant_a: {
    number: number
    name: string
    gender: string
    age: number
    mbti: string
  }
  participant_b: {
    number: number
    name: string
    gender: string  
    age: number
    mbti: string
  }
  compatibility_score: number
  detailed_scores: {
    mbti: number
    attachment: number
    communication: number
    lifestyle: number
    core_values: number
    vibe: number
  }
  round: number
  table_number?: number
  match_type: string
  mutual_match?: boolean
  is_repeat: boolean
}

export default function MatrixPage() {
  const [matches, setMatches] = useState<ParticipantMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [scoreFilter, setScoreFilter] = useState(0)
  const [search, setSearch] = useState("")
  const [eventFilter, setEventFilter] = useState<number | null>(null)
  const [mutualOnly, setMutualOnly] = useState(false)
  const [expandedRounds, setExpandedRounds] = useState<Record<number, boolean>>({})

  useEffect(() => {
    fetchAllMatches()
  }, [])

  const fetchAllMatches = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-all-matches" })
      })
      const data = await res.json()
      if (data.success) {
        setMatches(data.matches || [])
      }
    } catch (err) {
      console.error("Error fetching matches:", err)
    } finally {
      setLoading(false)
    }
  }

  // Filter matches based on criteria
  const filteredMatches = matches.filter(match => {
    // Score filter
    if (match.compatibility_score < scoreFilter) return false
    
    // Event filter (round field now contains event_id from API)
    if (eventFilter !== null && match.round !== eventFilter) return false
    
    // Mutual match filter
    if (mutualOnly && !match.mutual_match) return false
    
    // Search filter
    if (search.trim() !== "") {
      const searchTerm = search.toLowerCase()
      return (
        match.participant_a.name?.toLowerCase().includes(searchTerm) ||
        match.participant_b.name?.toLowerCase().includes(searchTerm) ||
        match.participant_a.number.toString().includes(search) ||
        match.participant_b.number.toString().includes(search) ||
        match.participant_a.mbti?.toLowerCase().includes(searchTerm) ||
        match.participant_b.mbti?.toLowerCase().includes(searchTerm)
      )
    }
    
    return true
  })

  // Group matches by round
  const grouped = filteredMatches.reduce((acc, match) => {
    const round = match.round ?? 0
    if (!acc[round]) acc[round] = []
    acc[round].push(match)
    return acc
  }, {} as Record<number, ParticipantMatch[]>)

  // Sort each group by compatibility score
  Object.keys(grouped).forEach(roundKey => {
    grouped[Number(roundKey)] = grouped[Number(roundKey)].sort((a, b) => b.compatibility_score - a.compatibility_score)
  })

  const totalMatches = matches.length
  const filteredCount = filteredMatches.length
  const uniqueEvents = [...new Set(matches.map(m => m.round))].sort() // round field contains event_id
  const mutualMatchCount = matches.filter(m => m.mutual_match).length


  // UI helpers
  const toggleRound = (round: number) => {
    setExpandedRounds(prev => ({ ...prev, [round]: !prev[round] }))
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400"
    if (score >= 70) return "text-green-400"
    if (score >= 60) return "text-yellow-400"
    if (score >= 40) return "text-orange-400"
    return "text-red-400"
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-10 px-4 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-5xl font-bold text-cyan-300 drop-shadow mb-4">💎 مصفوفة التوافق الشاملة</h1>
          <div className="flex justify-center items-center gap-6 text-sm text-cyan-200">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              <span>إجمالي المطابقات: {totalMatches}</span>
            </div>
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4" />
              <span>المطابقات المتبادلة: {mutualMatchCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span>النتائج المُرشحة: {filteredCount}</span>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="bg-slate-800/60 backdrop-blur rounded-3xl p-6 shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-cyan-400" />
              <input
                type="text"
                placeholder="بحث بالاسم، الرقم أو MBTI..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg px-3 py-2 bg-slate-900/60 text-cyan-100 placeholder-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
            </div>

            {/* Score Filter */}
            <div className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-cyan-400" />
              <span className="text-cyan-200 text-sm">التوافق:</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={scoreFilter}
                onChange={e => setScoreFilter(Number(e.target.value))}
                className="accent-cyan-400 flex-1"
              />
              <span className="text-cyan-300 font-bold">{scoreFilter}%+</span>
            </div>

            {/* Event Filter */}
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              <select
                value={eventFilter || ""}
                onChange={e => setEventFilter(e.target.value ? Number(e.target.value) : null)}
                className="flex-1 rounded-lg px-3 py-2 bg-slate-900/60 text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              >
                <option value="">جميع الأحداث</option>
                {uniqueEvents.map((event: number) => (
                  <option key={event} value={event}>حدث {event}</option>
                ))}
              </select>
            </div>

            {/* Mutual Filter */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mutualOnly}
                  onChange={e => setMutualOnly(e.target.checked)}
                  className="rounded text-cyan-400 focus:ring-cyan-400"
                />
                <Heart className="w-5 h-5 text-pink-400" />
                <span className="text-cyan-200">المتبادلة فقط</span>
              </label>
            </div>
          </div>

          {/* Refresh Button */}
          <div className="flex justify-center mt-4">
            <button
              onClick={fetchAllMatches}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              تحديث البيانات
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center gap-3 text-cyan-200 text-xl">
              <RefreshCw className="w-6 h-6 animate-spin" />
              جاري تحميل البيانات...
            </div>
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-red-400 text-xl">لا توجد مطابقات متوفرة حالياً</p>
          </div>
        ) : filteredCount === 0 ? (
          <div className="text-center py-12">
            <p className="text-yellow-400 text-xl">لا توجد نتائج تطابق الفلترة المحددة</p>
          </div>
        ) : (
          /* Match Results by Round */
          Object.entries(grouped).map(([roundStr, roundMatches]) => {
            const round = Number(roundStr)
            const isOpen = expandedRounds[round] ?? true
            const topScore = roundMatches.length > 0 ? roundMatches[0].compatibility_score : 0

            return (
              <div key={round} className="rounded-3xl bg-slate-800/70 shadow-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 bg-slate-900/70 hover:bg-slate-900/90 transition text-cyan-200 text-xl font-bold border-b border-slate-700 focus:outline-none"
                  onClick={() => toggleRound(round)}
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-6 h-6" />
                    <span>حدث {round > 0 ? round : "المجموعات"}</span>
                    <span className="text-sm bg-cyan-500/20 px-2 py-1 rounded-full">
                      {roundMatches.length} مطابقة
                    </span>
                  </div>
                  {isOpen ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                </button>

                <div className={`transition-all duration-500 ${isOpen ? 'max-h-none opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-6">
                    {roundMatches.map((match, i) => {
                      const isTopMatch = match.compatibility_score === topScore && topScore > 0
                      
                      return (
                        <div
                          key={match.id}
                          className={`relative bg-gradient-to-br from-slate-900/80 to-slate-800/80 border-2 rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-300 ${
                            isTopMatch ? 'border-cyan-400 shadow-cyan-400/30' : 
                            match.mutual_match ? 'border-pink-400/50 shadow-pink-400/20' : 
                            'border-slate-700'
                          }`}
                        >
                          {/* Top Match Badge */}
                          {isTopMatch && (
                            <div className="absolute -top-2 -left-2 bg-cyan-400 text-slate-900 rounded-full px-2 py-1 text-xs font-bold shadow-lg flex items-center gap-1">
                              <Star className="w-3 h-3" /> الأعلى
                            </div>
                          )}
                          
                          {/* Mutual Match Badge */}
                          {match.mutual_match && (
                            <div className="absolute -top-2 -right-2 bg-pink-500 text-white rounded-full px-2 py-1 text-xs font-bold shadow-lg flex items-center gap-1">
                              <Heart className="w-3 h-3" /> متبادل
                            </div>
                          )}

                          {/* Participants Info */}
                          <div className="space-y-4">
                            {/* Participant A */}
                            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
                              <div>
                                <div className="flex items-center gap-2">
                                  <UserRound className="w-4 h-4 text-cyan-400" />
                                  <span className="font-bold text-cyan-300">#{match.participant_a.number}</span>
                                  <span className="text-sm text-slate-400">{match.participant_a.gender}</span>
                                </div>
                                <p className="font-semibold text-white mt-1">{match.participant_a.name || 'غير محدد'}</p>
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-slate-400">العمر: {match.participant_a.age || 'غير محدد'}</div>
                                <div className="text-xs font-mono bg-slate-700 px-2 py-1 rounded mt-1">
                                  {match.participant_a.mbti || 'غير محدد'}
                                </div>
                              </div>
                            </div>

                            {/* VS Separator with Score */}
                            <div className="flex items-center justify-center relative">
                              <div className="flex-1 h-px bg-gradient-to-r from-transparent to-slate-600"></div>
                              <div className="mx-4 text-center">
                                <div className={`text-3xl font-extrabold ${getScoreColor(match.compatibility_score)}`}>
                                  {match.compatibility_score}%
                                </div>
                                <div className="text-xs text-slate-400 mt-1">توافق</div>
                              </div>
                              <div className="flex-1 h-px bg-gradient-to-l from-transparent to-slate-600"></div>
                            </div>

                            {/* Participant B */}
                            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
                              <div>
                                <div className="flex items-center gap-2">
                                  <UserRound className="w-4 h-4 text-cyan-400" />
                                  <span className="font-bold text-cyan-300">#{match.participant_b.number}</span>
                                  <span className="text-sm text-slate-400">{match.participant_b.gender}</span>
                                </div>
                                <p className="font-semibold text-white mt-1">{match.participant_b.name || 'غير محدد'}</p>
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-slate-400">العمر: {match.participant_b.age || 'غير محدد'}</div>
                                <div className="text-xs font-mono bg-slate-700 px-2 py-1 rounded mt-1">
                                  {match.participant_b.mbti || 'غير محدد'}
                                </div>
                              </div>
                            </div>

                            {/* Detailed Scores */}
                            <details className="group">
                              <summary className="flex items-center gap-2 cursor-pointer text-cyan-200 text-sm font-bold select-none hover:text-cyan-100">
                                <Info className="w-4 h-4 text-cyan-400" /> تفاصيل التوافق
                              </summary>
                              <div className="mt-3 space-y-2">
                                {[
                                  { name: "MBTI", score: match.detailed_scores.mbti, max: 10 },
                                  { name: "التعلق", score: match.detailed_scores.attachment, max: 15 },
                                  { name: "التواصل", score: match.detailed_scores.communication, max: 25 },
                                  { name: "نمط الحياة", score: match.detailed_scores.lifestyle, max: 15 },
                                  { name: "القيم", score: match.detailed_scores.core_values, max: 20 },
                                  { name: "الطاقة", score: match.detailed_scores.vibe, max: 15 }
                                ].map(({ name, score, max }) => (
                                  <div key={name} className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
                                    <span className="text-xs font-semibold text-slate-300">{name}</span>
                                    <div className="flex items-center gap-2">
                                      <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full transition-all duration-300 ${getScoreColor((score / max) * 100).replace('text-', 'bg-')}`}
                                          style={{ width: `${(score / max) * 100}%` }}
                                        />
                                      </div>
                                      <span className="text-xs font-mono w-8 text-right">{score}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>

                            {/* Additional Info */}
                            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-700">
                              {match.table_number && (
                                <span>طاولة: {match.table_number}</span>
                              )}
                              {match.is_repeat && (
                                <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">مكرر</span>
                              )}
                              <span className="ml-auto">{match.match_type}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
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
