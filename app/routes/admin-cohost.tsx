import { useState, useEffect, useCallback } from "react"
import { CheckCircle2, Circle, Search, Users, RefreshCw, Loader2, Heart, Lock } from "lucide-react"

interface Participant {
  number: number
  name: string
  gender: string | null
  age: number | null
  matched_with: number | null
  attended: boolean
}

export default function AdminCohostPage() {
  const [password, setPassword] = useState("")
  const [authenticated, setAuthenticated] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [toggling, setToggling] = useState<Record<number, boolean>>({})
  const [error, setError] = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "e3-get-attendance", password: "soulmatch2026" }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Failed to load")
        return
      }
      setParticipants(data.participants || [])
    } catch {
      setError("Network error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authenticated) fetchData()
  }, [authenticated, fetchData])

  const toggleAttendance = async (p: Participant) => {
    setToggling(prev => ({ ...prev, [p.number]: true }))
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "e3-set-attendance", password: "soulmatch2026", participant_number: p.number, attended: !p.attended }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setParticipants(prev => prev.map(x => x.number === p.number ? { ...x, attended: data.attended } : x))
      }
    } catch {
      // ignore
    } finally {
      setToggling(prev => { const c = { ...prev }; delete c[p.number]; return c })
    }
  }

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === "bayan2026") {
      setAuthenticated(true)
    } else {
      setError("Wrong password")
    }
  }

  const filtered = participants.filter(p => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return p.name.toLowerCase().includes(q) || String(p.number).includes(q)
  })

  const attendedCount = participants.filter(p => p.attended).length
  const matchedParticipant = (num: number | null) => participants.find(p => p.number === num)

  // Login screen
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6" dir="rtl">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-teal-600/30 to-cyan-600/20 border border-teal-500/20 flex items-center justify-center mb-4">
              <Heart size={24} className="text-teal-300" />
            </div>
            <h1 className="text-xl font-bold text-white">Co-Host Access</h1>
            <p className="text-gray-500 text-sm mt-1">SoulMatch Event Attendance</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-3">
            <div className="relative">
              <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError("") }}
                placeholder="Password"
                autoFocus
                className="w-full bg-gray-900/80 border border-gray-800 focus:border-teal-600/50 rounded-xl py-3 pr-10 pl-4 text-white text-sm placeholder-gray-600 outline-none transition-colors"
              />
            </div>
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl py-3 font-bold text-sm transition-all"
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Main attendance page
  return (
    <div className="min-h-screen bg-gray-950 text-white" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-600/30 to-cyan-600/20 border border-teal-500/20 flex items-center justify-center">
                <Users size={17} className="text-teal-300" />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight">Attendance</h1>
                <p className="text-gray-600 text-[10px] leading-tight">SoulMatch · Co-Host</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-lg font-bold tabular-nums">
                  <span className="text-teal-400">{attendedCount}</span>
                  <span className="text-gray-600">/</span>
                  <span className="text-gray-400">{participants.length}</span>
                </div>
                <div className="text-[9px] text-gray-600">checked in</div>
              </div>
              <button
                onClick={fetchData}
                disabled={loading}
                className="w-9 h-9 rounded-xl bg-gray-900/80 border border-gray-800 hover:border-teal-600/30 flex items-center justify-center transition-colors"
              >
                {loading ? <Loader2 size={15} className="animate-spin text-gray-500" /> : <RefreshCw size={15} className="text-gray-400" />}
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-2.5 h-1 bg-gray-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-500"
              style={{ width: `${participants.length > 0 ? (attendedCount / participants.length) * 100 : 0}%` }}
            />
          </div>

          {/* Search */}
          <div className="mt-3 relative">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or number..."
              className="w-full bg-gray-900/80 border border-gray-800 focus:border-teal-600/40 rounded-lg py-2 pr-9 pl-3 text-sm text-white placeholder-gray-600 outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="max-w-2xl mx-auto px-4 py-4 pb-20">
        {error && (
          <div className="text-center py-8">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={fetchData} className="mt-3 text-teal-400 text-xs underline">Retry</button>
          </div>
        )}

        {!error && loading && participants.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-gray-600" />
          </div>
        )}

        {!error && !loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-600 text-sm">No participants found</p>
          </div>
        )}

        {/* Participant rows */}
        <div className="space-y-1.5">
          {filtered.map(p => {
            const match = p.matched_with ? matchedParticipant(p.matched_with) : null
            return (
              <button
                key={p.number}
                onClick={() => toggleAttendance(p)}
                disabled={toggling[p.number]}
                className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-xl border transition-all text-right ${
                  p.attended
                    ? "bg-teal-900/20 border-teal-700/30 hover:bg-teal-900/30"
                    : "bg-gray-900/60 border-gray-800/60 hover:bg-gray-900/80"
                }`}
              >
                {/* Check icon */}
                <div className="flex-shrink-0">
                  {toggling[p.number] ? (
                    <Loader2 size={20} className="animate-spin text-gray-500" />
                  ) : p.attended ? (
                    <CheckCircle2 size={20} className="text-teal-400" />
                  ) : (
                    <Circle size={20} className="text-gray-700" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-sm truncate ${p.attended ? "text-teal-200" : "text-white"}`}>{p.name}</span>
                    <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">#{p.number}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.gender && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                        p.gender === "female" || p.gender === "أنثى" || p.gender === "أُنثَى"
                          ? "bg-pink-900/40 text-pink-300"
                          : "bg-blue-900/40 text-blue-300"
                      }`}>
                        {p.gender === "female" || p.gender === "أنثى" || p.gender === "أُنثَى" ? "♀" : "♂"}
                      </span>
                    )}
                    {p.age && <span className="text-[10px] text-gray-600">{p.age}y</span>}
                    {match && (
                      <span className="text-[10px] text-gray-500 truncate">
                        ↔ {match.name} #{match.number}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status label */}
                <div className="flex-shrink-0">
                  <span className={`text-[10px] font-semibold ${p.attended ? "text-teal-400" : "text-gray-600"}`}>
                    {p.attended ? "Present" : "Absent"}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}