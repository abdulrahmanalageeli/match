import { useState, useEffect, useMemo } from "react"
import { UserRound, Info, Gauge, Search, Star, Heart, Users, Trophy, Filter, RefreshCw, ChevronDown, ChevronUp, Trash2, AlertTriangle, MessageSquare, ThumbsUp, ThumbsDown, BarChart, X, Download } from "lucide-react"
import FeedbackStatsModal from "~/components/FeedbackStatsModal"
import FeedbackPairsModal from "~/components/FeedbackPairsModal"
import { isCurrentBalancedScoreRow, isCurrentOppositesScoreRow } from "~/lib/compatibility-model"

interface FeedbackData {
  participant_number: number
  compatibility_rate: number
  conversation_quality: number
  personal_connection: number
  shared_interests: number
  comfort_level: number
  communication_style: number
  would_meet_again: boolean
  overall_experience: number
  recommendations?: string
  participant_message?: string
  organizer_impression?: string
  submitted_at: string
}

interface BalancedScoreBreakdown {
  semanticCommonGround?: number | null
  aiSemantic?: number | null
  sharedContext?: number | null
  interactionRhythm?: number | null
  humorOpenness?: number | null
  attachmentComfort?: number | null
  lifestyleSustainability?: number | null
  valuesBoundaries?: number | null
  valuesBoundariesLanguage?: number | null
  language?: number | null
  communicationDisagreement?: number | null
  intent?: number | null
  interactionSynergy?: number | null
  coreValuesAlignment?: number | null
  communicationAlignment?: number | null
  lifestyleDifference?: number | null
  vibeDifference?: number | null
  humorDifference?: number | null
}

interface ParticipantMatch {
  id: string
  participant_a: {
    number: number
    name: string
    gender: string
    age: number
    mbti: string
    survey_data: any // Keeping it flexible for now
  }
  participant_b: {
    number: number
    name: string
    gender: string  
    age: number
    mbti: string
    survey_data: any // Keeping it flexible for now
  }
  compatibility_score: number
  detailed_scores: {
    // Legacy fields (old model) - keep required for compatibility with FeedbackStatsModal
    mbti: number
    attachment: number
    communication: number
    lifestyle: number
    core_values: number
    vibe: number
    // Intermediate and balanced 100-point model fields.
    synergy?: number
    humor_open?: number
    intent?: number // 0..5
    shared_context?: number
    attachment_comfort?: number
    communication_disagreement?: number
    values_boundaries_language?: number
  }
  score_model_version?: string | null
  score_breakdown?: BalancedScoreBreakdown | null
  score_snapshot?: Record<string, unknown> | string | null
  reason?: string | null
  communication_disagreement_score?: number | null
  values_boundaries_score?: number | null
  language_score?: number | null
  shared_context_score?: number | null
  bonus_type: 'none' | 'partial' | 'full'
  round: number
  table_number?: number
  match_type: string
  mutual_match?: boolean
  is_repeat: boolean
  feedback?: {
    participant_a: FeedbackData | null
    participant_b: FeedbackData | null
    has_feedback: boolean
  }
}

const firstFiniteScore = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const getReasonScore = (reason: string, ...labels: string[]): number | null => {
  const escaped = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const result = reason.match(new RegExp(`(?:${escaped})\\s*[:：]\\s*(-?\\d+(?:\\.\\d+)?)\\s*(?:/\\s*\\d+(?:\\.\\d+)?|%)?`, 'i'))
  return result ? firstFiniteScore(result[1]) : null
}

const isBalancedMatchRow = (match: ParticipantMatch) => {
  return isCurrentBalancedScoreRow(match)
}

export default function MatrixPage() {
  const [matches, setMatches] = useState<ParticipantMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [scoreFilter, setScoreFilter] = useState(0)
  const [search, setSearch] = useState("")
  const [eventFilter, setEventFilter] = useState<number | null>(null)
  const [mutualOnly, setMutualOnly] = useState(false)
  const [feedbackSort, setFeedbackSort] = useState<'none' | 'asc' | 'desc'>('none')
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'with-feedback' | 'no-feedback'>('all')
  const [expandedRounds, setExpandedRounds] = useState<Record<number, boolean>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deletingMatch, setDeletingMatch] = useState<string | null>(null)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [showFeedbackPairsModal, setShowFeedbackPairsModal] = useState(false)
  const [authed, setAuthed] = useState(false)

  // Selection and export state
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set())
  const [includeAnswersJson, setIncludeAnswersJson] = useState(false)

  // Client-side admin guard using localStorage flag set by admin page
  useEffect(() => {
    // Only run on client
    const ok = typeof window !== 'undefined' && localStorage.getItem('admin') === 'authenticated'
    if (!ok) {
      if (typeof window !== 'undefined') window.location.href = '/admin'
      return
    }
    setAuthed(true)
  }, [])

  // Load matches only after auth is confirmed
  useEffect(() => {
    if (!authed) return
    fetchAllMatches()
  }, [authed])

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

  const handleDeleteMatch = async (matchId: string) => {
    setDeletingMatch(matchId)
    try {
      // Find the match in our current matches to get participant numbers and event_id
      const match = matches.find(m => m.id === matchId)
      if (!match) {
        alert("لم يتم العثور على المطابقة")
        return
      }
      
      // Extract participant data with validation
      const participantA = match.participant_a?.number
      const participantB = match.participant_b?.number  
      const eventId = match.round // event_id is stored in round field
      
      console.log("🔍 Delete match validation:")
      console.log("  - Match ID:", matchId)
      console.log("  - Participant A:", participantA)
      console.log("  - Participant B:", participantB)
      console.log("  - Event ID:", eventId)
      console.log("  - Full match object:", match)
      
      // Validate required parameters
      if (!participantA || !participantB || !eventId) {
        const missingParams = []
        if (!participantA) missingParams.push("Participant A")
        if (!participantB) missingParams.push("Participant B") 
        if (!eventId) missingParams.push("Event ID")
        
        alert(`خطأ في البيانات: ${missingParams.join(", ")} مفقود`)
        return
      }
      
      console.log("✅ All parameters valid, sending delete request...")
      
      const requestBody = { 
        action: "delete-match", 
        participantA,
        participantB,
        eventId
      }
      
      console.log("📤 Sending request body:", JSON.stringify(requestBody, null, 2))
      
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      })
      
      const data = await res.json()
      console.log("Delete response:", data)
      
      if (res.ok && data.success) {
        // Remove the match from state
        setMatches(prev => prev.filter(m => m.id !== matchId))
        setDeleteConfirm(null)
        console.log("✅ Match deleted successfully")
      } else {
        console.error("Failed to delete match:", data.error || "Unknown error")
        alert("فشل في حذف المطابقة: " + (data.error || "خطأ غير معروف"))
      }
    } catch (err) {
      console.error("Error deleting match:", err)
      alert("حدث خطأ أثناء حذف المطابقة")
    } finally {
      setDeletingMatch(null)
    }
  }

  // Filter matches based on criteria
  let filteredMatches = matches.filter(match => {
    // Score filter
    if (match.compatibility_score < scoreFilter) return false
    
    // Event filter (round field now contains event_id from API)
    if (eventFilter !== null && match.round !== eventFilter) return false
    
    // Mutual match filter
    if (mutualOnly && !match.mutual_match) return false
    
    // Feedback filter
    if (feedbackFilter === 'with-feedback' && !match.feedback?.has_feedback) return false
    if (feedbackFilter === 'no-feedback' && match.feedback?.has_feedback) return false
    
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
  
  // Sort by feedback score if specified
  if (feedbackSort !== 'none') {
    filteredMatches = [...filteredMatches].sort((a, b) => {
      const feedbackA = getFeedbackCompatibility(a)
      const feedbackB = getFeedbackCompatibility(b)

      // Handle cases where one or both matches have no feedback
      if (feedbackA === null && feedbackB === null) return 0 // Keep original order if both have no feedback
      if (feedbackA === null) return 1 // Push matches without feedback to the bottom
      if (feedbackB === null) return -1 // Keep matches with feedback at the top

      // Sort by feedback score
      if (feedbackSort === 'asc') {
        return feedbackA - feedbackB
      } else {
        return feedbackB - feedbackA
      }
    })
  }

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

  // Determine active event for feedback pairs modal (use filter if set, else the latest event)
  const activeEventId = useMemo(() => {
    if (eventFilter !== null) return eventFilter
    if (uniqueEvents.length > 0) return uniqueEvents[uniqueEvents.length - 1]
    return 1
  }, [eventFilter, uniqueEvents])


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

  const getFeedbackCompatibility = (match: ParticipantMatch) => {
    if (!match.feedback?.has_feedback) return null
    
    const feedbackA = match.feedback.participant_a?.compatibility_rate
    const feedbackB = match.feedback.participant_b?.compatibility_rate
    
    if (feedbackA && feedbackB) {
      return Math.round((feedbackA + feedbackB) / 2)
    } else if (feedbackA) {
      return feedbackA
    } else if (feedbackB) {
      return feedbackB
    }
    
    return null
  }

  const getSpecificBonusType = async (match: ParticipantMatch) => {
    if (!match.bonus_type || match.bonus_type === 'none') return 'none'
    if (match.bonus_type === 'full') return 'humor_and_openness'
    
    // For partial bonuses, we need to check which specific bonus it is
    if (match.bonus_type === 'partial') {
      try {
        // Fetch participant data to check humor and openness answers
        const response = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'get-participant-bonus-data',
            participantA: match.participant_a.number,
            participantB: match.participant_b.number
          })
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            const { humorMatch, opennessMatch } = data
            if (humorMatch && !opennessMatch) return 'humor_only'
            if (!humorMatch && opennessMatch) return 'openness_only'
          }
        }
      } catch (error) {
        console.error('Error fetching bonus data:', error)
      }
    }
    
    return match.bonus_type // fallback to original
  }

  const getBonusDisplay = (bonusType: string) => {
    switch(bonusType) {
      case 'humor_and_openness': return { emoji: '🎯', text: 'دعابة + انفتاح', color: 'yellow' }
      case 'humor_only': return { emoji: '😂', text: 'دعابة فقط', color: 'orange' }
      case 'openness_only': return { emoji: '💕', text: 'انفتاح فقط', color: 'orange' }
      case 'full': return { emoji: '🎯', text: 'مكافأة كاملة', color: 'yellow' }
      case 'partial': return { emoji: '⭐', text: 'مكافأة جزئية', color: 'orange' }
      default: return { emoji: '⭐', text: 'مكافأة', color: 'orange' }
    }
  }

  // Component for bonus badge that handles API calls for partial bonuses
  const BonusBadge = ({ match }: { match: ParticipantMatch }) => {
    const [specificBonusType, setSpecificBonusType] = useState<string>(match.bonus_type)
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
      if (match.bonus_type === 'partial') {
        setIsLoading(true)
        // Call API to determine specific bonus type
        fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'get-participant-bonus-data',
            participantA: match.participant_a.number,
            participantB: match.participant_b.number
          })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            const { humorMatch, opennessMatch } = data
            if (humorMatch && !opennessMatch) {
              setSpecificBonusType('humor_only')
            } else if (!humorMatch && opennessMatch) {
              setSpecificBonusType('openness_only')
            } else {
              setSpecificBonusType('partial') // fallback
            }
          }
        })
        .catch(error => {
          console.error('Error fetching bonus data:', error)
          setSpecificBonusType('partial') // fallback
        })
        .finally(() => {
          setIsLoading(false)
        })
      }
    }, [match.bonus_type, match.participant_a.number, match.participant_b.number])

    if (!match.bonus_type || match.bonus_type === 'none') return null

    const display = getBonusDisplay(specificBonusType)
    
    return (
      <div className={`absolute top-2 left-2 rounded-full px-2 py-1 text-xs font-bold shadow-lg flex items-center gap-1 ${
        match.bonus_type === 'full' || specificBonusType === 'humor_and_openness'
          ? 'bg-yellow-500 text-yellow-900' 
          : 'bg-orange-500 text-orange-900'
      }`}>
        {isLoading ? (
          <>
            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            <span>تحليل...</span>
          </>
        ) : (
          <>
            <Star className="w-3 h-3" /> 
            {`${display.emoji} ${display.text}`}
          </>
        )}
      </div>
    )
  }

  // Component for bonus badge in bottom info section
  const BonusBottomBadge = ({ match }: { match: ParticipantMatch }) => {
    const [specificBonusType, setSpecificBonusType] = useState<string>(match.bonus_type)
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
      if (match.bonus_type === 'partial') {
        setIsLoading(true)
        // Call API to determine specific bonus type
        fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'get-participant-bonus-data',
            participantA: match.participant_a.number,
            participantB: match.participant_b.number
          })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            const { humorMatch, opennessMatch } = data
            if (humorMatch && !opennessMatch) {
              setSpecificBonusType('humor_only')
            } else if (!humorMatch && opennessMatch) {
              setSpecificBonusType('openness_only')
            } else {
              setSpecificBonusType('partial') // fallback
            }
          }
        })
        .catch(error => {
          console.error('Error fetching bonus data:', error)
          setSpecificBonusType('partial') // fallback
        })
        .finally(() => {
          setIsLoading(false)
        })
      }
    }, [match.bonus_type, match.participant_a.number, match.participant_b.number])

    const display = getBonusDisplay(specificBonusType)
    
    return (
      <span className={`px-2 py-1 rounded text-xs ${
        match.bonus_type === 'full' || specificBonusType === 'humor_and_openness'
          ? 'bg-yellow-500/20 text-yellow-400' 
          : 'bg-orange-500/20 text-orange-400'
      }`}>
        {isLoading ? (
          <>
            <div className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-1" />
            تحليل...
          </>
        ) : (
          `${display.emoji} ${display.text}`
        )}
      </span>
    )
  }

  // --- Selection & Export helpers ---
  const toggleSelectMatch = (id: string) => {
    setSelectedMatches(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAllVisible = () => {
    const next = new Set<string>()
    filteredMatches.forEach(m => {
      const bothFeedback = !!(m.feedback?.participant_a && m.feedback?.participant_b)
      if (bothFeedback) next.add(m.id)
    })
    setSelectedMatches(next)
  }

  const clearSelection = () => setSelectedMatches(new Set())

  const escapeCSV = (val: any) => {
    const s = (val === null || val === undefined) ? '' : String(val)
    return '"' + s.replace(/"/g, '""') + '"'
  }

  const extractAnswersJSON = (surveyData: any): string => {
    try {
      let sd = surveyData
      if (typeof sd === 'string') { try { sd = JSON.parse(sd) } catch { sd = {} } }
      const answers = sd?.answers ?? sd ?? null
      if (!answers || typeof answers !== 'object') return ''
      return JSON.stringify(answers)
    } catch {
      return ''
    }
  }

  const exportSelectedMatchesCSV = () => {
    if (selectedMatches.size === 0) {
      alert('يرجى اختيار بطاقات للمطابقات أولاً')
      return
    }
    // Respect current filters by intersecting with filteredMatches
    const selectedList = filteredMatches.filter(m => selectedMatches.has(m.id))
    if (selectedList.length === 0) {
      alert('لا توجد نتائج مطابقة للاختيار الحالي')
      return
    }

    const headers = [
      'event_id',
      'participant_a_number','participant_a_name','participant_a_gender','participant_a_age','participant_a_mbti',
      'participant_b_number','participant_b_name','participant_b_gender','participant_b_age','participant_b_mbti',
      'compatibility_score','تقييم المشاركين (18%)','synergy_score','humor_open_score','intent_score',
      'mbti_score','attachment_score','communication_score','lifestyle_score','core_values_score','vibe_score',
      'mutual_match','match_type','table_number'
    ]

    const headersWithJSON = includeAnswersJson
      ? [...headers, 'participant_a_answers_json','participant_b_answers_json']
      : headers

    const rows: string[] = []
    rows.push(headersWithJSON.join(','))

    for (const m of selectedList) {
      const a = m.participant_a
      const b = m.participant_b
      const fa = m.feedback?.participant_a?.compatibility_rate
      const fb = m.feedback?.participant_b?.compatibility_rate
      const feedbackBoth = typeof fa === 'number' && typeof fb === 'number'
      const feedbackVal = feedbackBoth ? Math.round(((fa as number) + (fb as number)) / 2) : ''
      const rowCore = [
        escapeCSV(m.round ?? ''),
        escapeCSV(a?.number ?? ''), escapeCSV(a?.name ?? ''), escapeCSV(a?.gender ?? ''), escapeCSV(a?.age ?? ''), escapeCSV(a?.mbti ?? ''),
        escapeCSV(b?.number ?? ''), escapeCSV(b?.name ?? ''), escapeCSV(b?.gender ?? ''), escapeCSV(b?.age ?? ''), escapeCSV(b?.mbti ?? ''),
        escapeCSV(m.compatibility_score ?? 0), escapeCSV(feedbackVal), escapeCSV((m.detailed_scores?.synergy ?? (m as any).synergy_score) ?? 0), escapeCSV((m.detailed_scores?.humor_open ?? (m as any).humor_open_score) ?? 0), escapeCSV((m.detailed_scores?.intent ?? (m as any).intent_score) ?? 0),
        escapeCSV(m.detailed_scores?.mbti ?? 0), escapeCSV(m.detailed_scores?.attachment ?? 0), escapeCSV(m.detailed_scores?.communication ?? 0), escapeCSV(m.detailed_scores?.lifestyle ?? 0), escapeCSV(m.detailed_scores?.core_values ?? 0), escapeCSV(m.detailed_scores?.vibe ?? 0),
        escapeCSV(m.mutual_match ? 'yes' : 'no'), escapeCSV(m.match_type ?? ''), escapeCSV(m.table_number ?? '')
      ]

      if (includeAnswersJson) {
        const aJson = extractAnswersJSON(a?.survey_data)
        const bJson = extractAnswersJSON(b?.survey_data)
        rows.push([...rowCore, escapeCSV(aJson), escapeCSV(bJson)].join(','))
      } else {
        rows.push(rowCore.join(','))
      }
    }

    const csvContent = rows.join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    const ev = (eventFilter !== null ? `event_${eventFilter}` : 'all_events')
    link.download = `matrix_${ev}_${Date.now()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-10 px-4 font-sans">
      {showStatsModal && <FeedbackStatsModal matches={matches} onClose={() => setShowStatsModal(false)} />}
      {showFeedbackPairsModal && (
        <FeedbackPairsModal
          eventId={activeEventId}
          onClose={() => setShowFeedbackPairsModal(false)}
        />
      )}
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
          
          {/* Feedback Filters Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-700/50">
            {/* Feedback Filter */}
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-400" />
              <span className="text-cyan-200 text-sm whitespace-nowrap">التقييم:</span>
              <select
                value={feedbackFilter}
                onChange={e => setFeedbackFilter(e.target.value as 'all' | 'with-feedback' | 'no-feedback')}
                className="flex-1 rounded-lg px-3 py-2 bg-slate-900/60 text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              >
                <option value="all">جميع المطابقات</option>
                <option value="with-feedback">مع تقييم فقط</option>
                <option value="no-feedback">بدون تقييم</option>
              </select>
            </div>
            
            {/* Feedback Sort */}
            <div className="flex items-center gap-2">
              <ThumbsUp className="w-5 h-5 text-purple-400" />
              <span className="text-cyan-200 text-sm whitespace-nowrap">ترتيب التقييم:</span>
              <select
                value={feedbackSort}
                onChange={e => setFeedbackSort(e.target.value as 'none' | 'asc' | 'desc')}
                className="flex-1 rounded-lg px-3 py-2 bg-slate-900/60 text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              >
                <option value="none">بدون ترتيب</option>
                <option value="desc">الأعلى أولاً</option>
                <option value="asc">الأقل أولاً</option>
              </select>
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

            <button
              onClick={() => setShowStatsModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg transition"
            >
              <BarChart className="w-4 h-4" />
              تحليل التقييمات
            </button>

            <button
              onClick={() => setShowFeedbackPairsModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg transition"
              title="عرض أزواج التقييم حسب الحدث"
            >
              <MessageSquare className="w-4 h-4" />
              أزواج التقييم (الحدث {activeEventId})
            </button>
            {/* Include answers JSON toggle */}
            <label className="flex items-center gap-2 ml-4 px-3 py-2 bg-slate-700/40 rounded-lg text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeAnswersJson}
                onChange={(e) => setIncludeAnswersJson(e.target.checked)}
                className="accent-cyan-400"
              />
              <span className="text-sm">تضمين إجابات الاستبيان (JSON)</span>
            </label>

            {/* Export & selection controls */}
            <button
              onClick={exportSelectedMatchesCSV}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-lg transition ml-2"
              title="تصدير المطابقات المحددة إلى Excel (CSV)"
            >
              <Download className="w-4 h-4" />
              تصدير المحدد ({selectedMatches.size})
            </button>

            <button
              onClick={selectAllVisible}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600/20 hover:bg-slate-600/30 text-slate-200 rounded-lg transition ml-2"
              title="تحديد كل النتائج الظاهرة"
            >
              تحديد الكل (الظاهر)
            </button>

            <button
              onClick={clearSelection}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600/20 hover:bg-slate-600/30 text-slate-200 rounded-lg transition ml-2"
              title="مسح الاختيارات"
            >
              إلغاء التحديد
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
                          
                          {/* Bonus Type Badge */}
                          <BonusBadge match={match} />

                          {/* Selection checkbox */}
                          <div className="absolute bottom-2 right-2">
                            <input
                              type="checkbox"
                              checked={selectedMatches.has(match.id)}
                              onChange={() => toggleSelectMatch(match.id)}
                              className="w-4 h-4 accent-cyan-400"
                              aria-label="تحديد هذه البطاقة"
                              title="تحديد هذه البطاقة"
                            />
                          </div>

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
                                <div className="text-xs text-slate-400 mt-1">توافق النظام</div>
                                
                                {/* Feedback Compatibility Score */}
                                {(() => {
                                  const feedbackScore = getFeedbackCompatibility(match)
                                  if (feedbackScore !== null) {
                                    return (
                                      <div className="mt-2">
                                        <div className={`text-lg font-bold ${getScoreColor(feedbackScore)}`}>
                                          {feedbackScore}%
                                        </div>
                                        <div className="text-xs text-blue-400">تقييم المشاركين</div>
                                      </div>
                                    )
                                  }
                                  return null
                                })()}
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
                                {(() => {
                                  const balanced = isBalancedMatchRow(match)
                                  const opposites = isCurrentOppositesScoreRow(match)
                                  const breakdown = match.score_breakdown ?? {}
                                  const reason = String(match.reason || '')
                                  // Keep the prior 100-point presentation for historical rows.
                                  const hasNew = (
                                    typeof match.detailed_scores?.synergy === 'number' ||
                                    typeof match.detailed_scores?.humor_open === 'number' ||
                                    typeof match.detailed_scores?.intent === 'number'
                                  )

                                  const aiVibe = firstFiniteScore(
                                    breakdown.aiSemantic,
                                    getReasonScore(reason, 'AI Semantic', 'AI Vibe', 'Vibe', 'التوافق الدلالي', 'الطاقة'),
                                    match.detailed_scores.vibe,
                                  ) ?? 0
                                  const commonGround = firstFiniteScore(
                                    breakdown.semanticCommonGround,
                                    getReasonScore(reason, 'Common Ground', 'الأرضية المشتركة'),
                                  )
                                  const sharedContext = firstFiniteScore(
                                    breakdown.sharedContext,
                                    match.shared_context_score,
                                    match.detailed_scores.shared_context,
                                    getReasonScore(reason, 'Shared Context', 'السياق المشترك'),
                                    commonGround == null ? null : Math.max(0, commonGround - aiVibe),
                                  ) ?? 0
                                  const interaction = firstFiniteScore(
                                    breakdown.interactionRhythm,
                                    getReasonScore(reason, 'Interaction Rhythm', 'Synergy', 'إيقاع التفاعل', 'التفاعل'),
                                    match.detailed_scores.synergy,
                                  ) ?? 0
                                  const humorOpen = firstFiniteScore(
                                    breakdown.humorOpenness,
                                    getReasonScore(reason, 'Humor/Openness', 'الدعابة/الانفتاح'),
                                    match.detailed_scores.humor_open,
                                  ) ?? 0
                                  const attachmentComfort = firstFiniteScore(
                                    breakdown.attachmentComfort,
                                    getReasonScore(reason, 'Attachment Comfort', 'راحة التقارب'),
                                    match.detailed_scores.attachment_comfort,
                                    match.detailed_scores.attachment,
                                  ) ?? 0
                                  const lifestyle = firstFiniteScore(
                                    breakdown.lifestyleSustainability,
                                    getReasonScore(reason, 'Lifestyle', 'نمط الحياة'),
                                    match.detailed_scores.lifestyle,
                                  ) ?? 0
                                  const communication = firstFiniteScore(
                                    breakdown.communicationDisagreement,
                                    getReasonScore(reason, 'Communication/Disagreement', 'التواصل/الاختلاف'),
                                    match.communication_disagreement_score,
                                    match.detailed_scores.communication_disagreement,
                                    match.detailed_scores.communication,
                                  ) ?? 0
                                  const valuesBoundaries = firstFiniteScore(
                                    breakdown.valuesBoundaries,
                                    match.values_boundaries_score,
                                    getReasonScore(reason, 'Values/Boundaries', 'القيم/الحدود'),
                                  )
                                  const expressionLanguage = firstFiniteScore(
                                    breakdown.language,
                                    match.language_score,
                                    getReasonScore(reason, 'Expression Language', 'لغة التعبير'),
                                  )
                                  const valuesLanguage = firstFiniteScore(
                                    breakdown.valuesBoundariesLanguage,
                                    match.detailed_scores.values_boundaries_language,
                                    match.detailed_scores.core_values,
                                    valuesBoundaries == null && expressionLanguage == null
                                      ? null
                                      : (valuesBoundaries ?? 0) + (expressionLanguage ?? 0),
                                  ) ?? 0
                                  const intent = firstFiniteScore(
                                    breakdown.intent,
                                    getReasonScore(reason, 'Intent', 'Goal', 'Goals', 'الهدف', 'الأهداف'),
                                    match.detailed_scores.intent,
                                  ) ?? 0

                                  const items = balanced
                                    ? [
                                        { name: "السياق المشترك", score: sharedContext, max: 6 },
                                        { name: "توافق AI", score: aiVibe, max: 12 },
                                        { name: "التفاعل", score: interaction, max: 20 },
                                        { name: "الدعابة/الانفتاح", score: humorOpen, max: 10 },
                                        { name: "راحة التقارب", score: attachmentComfort, max: 8 },
                                        { name: "نمط الحياة", score: lifestyle, max: 12 },
                                        { name: "القيم/الحدود/اللغة", score: valuesLanguage, max: 17 },
                                        { name: "التواصل/الاختلاف", score: communication, max: 10 },
                                        { name: "الهدف", score: intent, max: 5 },
                                      ]
                                    : opposites
                                    ? [
                                        { name: "إيقاع التفاعل", score: Number(breakdown.interactionSynergy ?? 0), max: 20 },
                                        { name: "توافق القيم", score: Number(breakdown.coreValuesAlignment ?? 0), max: 17 },
                                        { name: "توافق التواصل", score: Number(breakdown.communicationAlignment ?? 0), max: 5 },
                                        { name: "اختلاف نمط الحياة", score: Number(breakdown.lifestyleDifference ?? 0), max: 12 },
                                        { name: "اختلاف الطاقة", score: Number(breakdown.vibeDifference ?? 0), max: 12 },
                                        { name: "اختلاف الدعابة", score: Number(breakdown.humorDifference ?? 0), max: 10 },
                                      ]
                                    : hasNew
                                    ? [
                                        { name: "التفاعل", score: match.detailed_scores.synergy ?? 0, max: 30 },
                                        { name: "الطاقة", score: match.detailed_scores.vibe ?? 0, max: 25 },
                                        { name: "نمط الحياة", score: match.detailed_scores.lifestyle ?? 0, max: 10 },
                                        { name: "الدعابة/الانفتاح", score: match.detailed_scores.humor_open ?? 0, max: 15 },
                                        { name: "التواصل", score: match.detailed_scores.communication ?? 0, max: 3 },
                                        { name: "الأهداف", score: match.detailed_scores.intent ?? 0, max: 5 }
                                      ]
                                    : [
                                        { name: "MBTI", score: match.detailed_scores.mbti ?? 0, max: 10 },
                                        { name: "التعلق", score: match.detailed_scores.attachment ?? 0, max: 15 },
                                        { name: "التواصل", score: match.detailed_scores.communication ?? 0, max: 25 },
                                        { name: "نمط الحياة", score: match.detailed_scores.lifestyle ?? 0, max: 15 },
                                        { name: "القيم", score: match.detailed_scores.core_values ?? 0, max: 20 },
                                        { name: "الطاقة", score: match.detailed_scores.vibe ?? 0, max: 15 }
                                      ]

                                  return <>
                                    <div className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${balanced ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300' : opposites ? 'border-violet-400/25 bg-violet-500/10 text-violet-300' : 'border-amber-400/25 bg-amber-500/10 text-amber-300'}`}>
                                      {balanced ? 'النموذج المتوازن الحالي · 100 نقطة' : opposites ? 'وضع الأضداد الحالي · 76 نقطة خام محوّلة إلى 100' : `حسبة تاريخية موروثة${match.score_model_version ? ` · ${match.score_model_version}` : ''}`}
                                    </div>
                                    {items.map(({ name, score, max }) => {
                                    const safeMax = max > 0 ? max : 1
                                    const percentage = Math.max(0, Math.min(100, Math.round((score / safeMax) * 100)))
                                    const displayScore = balanced || opposites ? Number(score.toFixed(1)) : Math.round(score)
                                    const barColor = percentage >= 80 ? 'bg-emerald-400' : 
                                                    percentage >= 70 ? 'bg-green-400' : 
                                                    percentage >= 60 ? 'bg-yellow-400' : 
                                                    percentage >= 40 ? 'bg-orange-400' : 'bg-red-400'
                                    return (
                                      <div key={name} className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
                                        <span className="text-xs font-semibold text-slate-300">{name}</span>
                                        <div className="flex items-center gap-2">
                                          <div className="w-20 h-3 bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full transition-all duration-300 ${barColor}`}
                                              style={{ width: `${percentage}%` }}
                                            />
                                          </div>
                                          <span className="text-xs font-mono w-14 text-right text-white font-bold">
                                            {displayScore}/{safeMax}
                                          </span>
                                          <span className="text-xs text-cyan-300 w-10 text-right">
                                            {percentage}%
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                  </>
                                })()}
                              </div>
                            </details>

                            {/* Feedback Section */}
                            {match.feedback?.has_feedback && (
                              <details className="group">
                                <summary className="flex items-center gap-2 cursor-pointer text-blue-200 text-sm font-bold select-none hover:text-blue-100">
                                  <MessageSquare className="w-4 h-4 text-blue-400" /> تقييمات المشاركين
                                </summary>
                                <div className="mt-3 space-y-3">
                                  {/* Participant A Feedback */}
                                  {match.feedback?.participant_a && (
                                    <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-500/30">
                                      <div className="flex items-center gap-2 mb-2">
                                        <UserRound className="w-4 h-4 text-blue-400" />
                                        <span className="text-sm font-semibold text-blue-300">
                                          #{match.participant_a.number} - {match.participant_a.name}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="flex items-center gap-1">
                                          <span className="text-slate-400">التوافق:</span>
                                          <span className="text-white font-bold">{match.feedback.participant_a.compatibility_rate}%</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-slate-400">جودة المحادثة:</span>
                                          <span className="text-white font-bold">{match.feedback.participant_a.conversation_quality}/5</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-slate-400">الاتصال الشخصي:</span>
                                          <span className="text-white font-bold">{match.feedback.participant_a.personal_connection}/5</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-slate-400">لقاء مرة أخرى:</span>
                                          {match.feedback.participant_a.would_meet_again ? (
                                            <ThumbsUp className="w-3 h-3 text-green-400" />
                                          ) : (
                                            <ThumbsDown className="w-3 h-3 text-red-400" />
                                          )}
                                        </div>
                                      </div>
                                      {match.feedback.participant_a.participant_message && (
                                        <div className="mt-2 p-2 bg-slate-800/50 rounded text-xs text-slate-200">
                                          <span className="text-blue-400 font-semibold">رسالة: </span>
                                          {match.feedback.participant_a.participant_message}
                                        </div>
                                      )}
                                      {match.feedback.participant_a.organizer_impression && (
                                        <div className="mt-2 p-2 bg-blue-950/30 rounded text-xs text-slate-200 border border-blue-900/30">
                                          <span className="text-blue-300 font-semibold">انطباع المنظم: </span>
                                          {match.feedback.participant_a.organizer_impression}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Participant B Feedback */}
                                  {match.feedback.participant_b && (
                                    <div className="p-3 bg-green-900/20 rounded-lg border border-green-500/30">
                                      <div className="flex items-center gap-2 mb-2">
                                        <UserRound className="w-4 h-4 text-green-400" />
                                        <span className="text-sm font-semibold text-green-300">
                                          #{match.participant_b.number} - {match.participant_b.name}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="flex items-center gap-1">
                                          <span className="text-slate-400">التوافق:</span>
                                          <span className="text-white font-bold">{match.feedback.participant_b.compatibility_rate}%</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-slate-400">جودة المحادثة:</span>
                                          <span className="text-white font-bold">{match.feedback.participant_b.conversation_quality}/5</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-slate-400">الاتصال الشخصي:</span>
                                          <span className="text-white font-bold">{match.feedback.participant_b.personal_connection}/5</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-slate-400">لقاء مرة أخرى:</span>
                                          {match.feedback.participant_b.would_meet_again ? (
                                            <ThumbsUp className="w-3 h-3 text-green-400" />
                                          ) : (
                                            <ThumbsDown className="w-3 h-3 text-red-400" />
                                          )}
                                        </div>
                                      </div>
                                      {match.feedback.participant_b.participant_message && (
                                        <div className="mt-2 p-2 bg-slate-800/50 rounded text-xs text-slate-200">
                                          <span className="text-green-400 font-semibold">رسالة: </span>
                                          {match.feedback.participant_b.participant_message}
                                        </div>
                                      )}
                                      {match.feedback.participant_b.organizer_impression && (
                                        <div className="mt-2 p-2 bg-emerald-950/30 rounded text-xs text-slate-200 border border-emerald-900/30">
                                          <span className="text-emerald-300 font-semibold">انطباع المنظم: </span>
                                          {match.feedback.participant_b.organizer_impression}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </details>
                            )}

                            {/* Additional Info and Actions */}
                            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-700">
                              <div className="flex items-center gap-2">
                                {match.table_number && (
                                  <span>طاولة: {match.table_number}</span>
                                )}
                                {match.is_repeat && (
                                  <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">مكرر</span>
                                )}
                                {match.bonus_type && match.bonus_type !== 'none' && (
                                  <BonusBottomBadge match={match} />
                                )}
                                <span>{match.match_type}</span>
                              </div>
                              
                              {/* Delete Button */}
                              <div className="flex items-center gap-2">
                                {deleteConfirm === match.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleDeleteMatch(match.id)}
                                      disabled={deletingMatch === match.id}
                                      className="flex items-center gap-1 px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition disabled:opacity-50"
                                    >
                                      {deletingMatch === match.id ? (
                                        <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <AlertTriangle className="w-3 h-3" />
                                      )}
                                      تأكيد الحذف
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm(null)}
                                      className="px-2 py-1 bg-slate-600 hover:bg-slate-700 text-white text-xs rounded transition"
                                    >
                                      إلغاء
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirm(match.id)}
                                    className="flex items-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 text-xs rounded transition"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    حذف
                                  </button>
                                )}
                              </div>
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
