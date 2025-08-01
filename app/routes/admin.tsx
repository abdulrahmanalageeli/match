import React, { useState, useEffect } from "react"
import {
  UserRound,
  QrCode,
  Trash2,
  Table2,
  LockKeyhole,
  RefreshCcw,
  LayoutDashboard,
  Loader2,
  Activity,
  Users,
  Settings,
  Eye,
  Copy,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Search,
  Filter,
  BarChart3,
  Shield,
  LogOut,
  Plus,
  Minus,
  Clock,
  CheckSquare,
  Square,
  X
} from "lucide-react"

export default function AdminPage() {
  const [password, setPassword] = useState("")
  const [authenticated, setAuthenticated] = useState(false)
  const [participants, setParticipants] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [qrParticipant, setQrParticipant] = useState<any | null>(null)
  const [detailParticipant, setDetailParticipant] = useState<any | null>(null)
  const [manualNumber, setManualNumber] = useState<number | null>(null)
  const [currentPhase, setCurrentPhase] = useState("form")
  const [searchTerm, setSearchTerm] = useState("")
  const [copied, setCopied] = useState(false)
  const [selectedParticipants, setSelectedParticipants] = useState<Set<number>>(new Set())
  const [announcement, setAnnouncement] = useState("")
  const [announcementType, setAnnouncementType] = useState("info")
  const [currentAnnouncement, setCurrentAnnouncement] = useState<any>(null)
  const [emergencyPaused, setEmergencyPaused] = useState(false)
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [waitingCount, setWaitingCount] = useState(0)
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [participantStats, setParticipantStats] = useState<any>(null)
  const [currentRounds, setCurrentRounds] = useState(2)
  const [optimalRounds, setOptimalRounds] = useState(2)
  const [globalTimerActive, setGlobalTimerActive] = useState(false)
  const [globalTimerRemaining, setGlobalTimerRemaining] = useState(0)
  const [globalTimerRound, setGlobalTimerRound] = useState(1)
  const [currentTime, setCurrentTime] = useState(new Date())

  const STATIC_PASSWORD = "soulmatch2025"
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "soulmatch2025"

  const fetchParticipants = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "participants" }),
      })
      const data = await res.json()
      setParticipants(data.participants || [])
      
      // Also fetch current event state
      const stateRes = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-event-state" }),
      })
      const stateData = await stateRes.json()
      setCurrentPhase(stateData.phase)
      setCurrentAnnouncement({
        message: stateData.announcement,
        type: stateData.announcement_type,
        time: stateData.announcement_time
      })
      setEmergencyPaused(stateData.emergency_paused)
      setCurrentRounds(stateData.total_rounds || 2)
      
      // Update global timer state
      setGlobalTimerActive(stateData.global_timer_active || false)
      setGlobalTimerRound(stateData.global_timer_round || 1)
      
      if (stateData.global_timer_active && stateData.global_timer_start_time) {
        const startTime = new Date(stateData.global_timer_start_time).getTime()
        const now = new Date().getTime()
        const elapsed = Math.floor((now - startTime) / 1000)
        const remaining = Math.max(0, (stateData.global_timer_duration || 1800) - elapsed)
        setGlobalTimerRemaining(remaining)
      }
      
      // Fetch participant stats
      const statsRes = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-participant-stats" }),
      })
      const statsData = await statsRes.json()
      setParticipantStats(statsData)
      setWaitingCount(statsData.waiting_count || 0)
      setTotalParticipants(statsData.total_participants || 0)
      
      // Calculate optimal rounds based on participant count
      calculateOptimalRounds(data.participants?.length || 0)
    } catch (err) {
      console.error("Fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  const calculateOptimalRounds = (participantCount: number) => {
    if (participantCount <= 0) {
      setOptimalRounds(2)
      return
    }
    
    // Calculate optimal rounds to minimize repeats
    // For n participants, we can have at most n/2 unique pairs per round
    // We want to maximize unique pairs across all rounds
    const maxPairsPerRound = Math.floor(participantCount / 2)
    const totalPossiblePairs = (participantCount * (participantCount - 1)) / 2
    
    // Calculate how many rounds we can have before we need repeats
    const optimalRounds = Math.floor(totalPossiblePairs / maxPairsPerRound)
    
    // Ensure at least 2 rounds and at most 6 rounds
    const clampedRounds = Math.max(2, Math.min(6, optimalRounds))
    setOptimalRounds(clampedRounds)
  }

  const updateRounds = async (newRounds: number) => {
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-total-rounds",
          total_rounds: newRounds
        }),
      })
      
      if (res.ok) {
        setCurrentRounds(newRounds)
        alert(`✅ Rounds updated to ${newRounds}`)
        fetchParticipants()
      } else {
        const data = await res.json()
        alert("❌ Failed to update rounds: " + (data.error || "Unknown error"))
      }
    } catch (err) {
      console.error("Error updating rounds:", err)
      alert("❌ Failed to update rounds")
    }
  }

  const deleteParticipant = async (assigned_number: number) => {
    if (!confirm(`Are you sure you want to delete participant #${assigned_number}?`)) return
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", assigned_number }),
    })
    fetchParticipants()
  }



  const openMatrix = () => {
    window.open("/matrix", "_blank", "width=1000,height=800")
  }

  const login = () => {
    if (password === STATIC_PASSWORD) {
      localStorage.setItem("admin", "authenticated")
      setAuthenticated(true)
      fetchParticipants()
    } else {
      alert("❌ Wrong password.")
    }
  }

  const logout = () => {
    localStorage.removeItem("admin")
    setAuthenticated(false)
    setPassword("")
  }

  useEffect(() => {
    if (localStorage.getItem("admin") === "authenticated") {
      setAuthenticated(true)
      fetchParticipants()
    }
  }, [])

  // Real-time clock update
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(clockInterval)
  }, [])

  // Update global timer countdown
  useEffect(() => {
    if (globalTimerActive && globalTimerRemaining > 0) {
      console.log(`⏰ Admin: Starting countdown from ${globalTimerRemaining}s`)
      
      const timerInterval = setInterval(() => {
        setGlobalTimerRemaining(prev => {
          const newValue = Math.max(0, prev - 1)
          if (newValue <= 0) {
            console.log("⏰ Admin: Timer expired locally")
            // Timer expired, refresh to get latest state
            fetchParticipants()
          }
          return newValue
        })
      }, 1000)

      return () => {
        console.log("⏰ Admin: Clearing countdown interval")
        clearInterval(timerInterval)
      }
    }
  }, [globalTimerActive, globalTimerRemaining]) // Add globalTimerRemaining back to dependencies

  const updatePhase = async (phase: string) => {
    console.log(`🔄 Admin: Updating phase to ${phase}`);
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set-phase",
        match_id: "00000000-0000-0000-0000-000000000000",
        phase,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      console.error(`❌ Admin: Failed to update phase to ${phase}:`, data.error);
      alert("❌ Error: " + data.error)
    } else {
      console.log(`✅ Admin: Successfully updated phase to ${phase}`);
      setCurrentPhase(phase)
      alert("✅ Phase updated to " + phase + "\n\n🚀 All players will instantly transition from ANY state they're in!\n⚡ Change visible within 2 seconds!")
    }
  }

  const startGlobalTimer = async (round: number) => {
    console.log(`🚀 Admin: Starting global timer for round ${round}`)
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start-global-timer",
          match_id: "00000000-0000-0000-0000-000000000000",
          round: round,
          duration: 1800 // 30 minutes
        }),
      })
      const data = await res.json()
      console.log("🔄 Start timer response:", data)
      
      if (!res.ok) {
        console.error("❌ Error starting timer:", data.error)
        alert("❌ Error starting timer: " + data.error)
      } else {
        console.log("✅ Timer started successfully")
        setGlobalTimerActive(true)
        setGlobalTimerRound(round)
        setGlobalTimerRemaining(1800) // Set initial remaining time
        alert(`✅ Global timer started for ${round === 0 ? 'Group Phase' : `Round ${round}`}!\n⏰ 30 minutes timer is now active for all participants.`)
        
        // Refresh to get updated state
        setTimeout(() => fetchParticipants(), 500)
      }
    } catch (error) {
      console.error("❌ Network error starting timer:", error)
      alert("❌ Network error starting timer")
    }
  }

  const endGlobalTimer = async () => {
    console.log("🛑 Admin: Ending global timer")
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end-global-timer",
          match_id: "00000000-0000-0000-0000-000000000000"
        }),
      })
      const data = await res.json()
      console.log("🔄 End timer response:", data)
      
      if (!res.ok) {
        console.error("❌ Error ending timer:", data.error)
        alert("❌ Error ending timer: " + data.error)
      } else {
        console.log("✅ Timer ended successfully")
        setGlobalTimerActive(false)
        setGlobalTimerRemaining(0)
        alert("✅ Global timer ended!\n⏹️ All participants will see feedback form.")
        
        // Refresh to get updated state
        setTimeout(() => fetchParticipants(), 500)
      }
    } catch (error) {
      console.error("❌ Network error ending timer:", error)
      alert("❌ Network error ending timer")
    }
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleParticipantSelection = (assignedNumber: number) => {
    const newSelected = new Set(selectedParticipants)
    if (newSelected.has(assignedNumber)) {
      newSelected.delete(assignedNumber)
    } else {
      newSelected.add(assignedNumber)
    }
    setSelectedParticipants(newSelected)
  }

  const filteredParticipants = participants.filter(p => 
    p.assigned_number.toString().includes(searchTerm) ||
    (p.survey_data?.answers?.gender?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.survey_data?.answers?.ageGroup?.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const phaseConfig = {
    registration: { label: "Registration", color: "text-blue-400", bg: "bg-blue-400/10", icon: UserRound },
    form: { label: "Form", color: "text-green-400", bg: "bg-green-400/10", icon: CheckSquare },
    waiting: { label: "Waiting", color: "text-yellow-400", bg: "bg-yellow-400/10", icon: Clock },
    round_1: { label: "Round 1", color: "text-purple-400", bg: "bg-purple-400/10", icon: BarChart3 },
    waiting_2: { label: "Waiting 2", color: "text-yellow-300", bg: "bg-yellow-300/10", icon: Clock },
    round_2: { label: "Round 2", color: "text-pink-400", bg: "bg-pink-400/10", icon: BarChart3 },
    // waiting_3: { label: "Waiting 3", color: "text-yellow-200", bg: "bg-yellow-200/10", icon: Clock },
    // round_3: { label: "Round 3", color: "text-indigo-400", bg: "bg-indigo-400/10", icon: BarChart3 },
    // waiting_4: { label: "Waiting 4", color: "text-yellow-100", bg: "bg-yellow-100/10", icon: Clock },
    // round_4: { label: "Round 4", color: "text-cyan-400", bg: "bg-cyan-400/10", icon: BarChart3 },
    group_phase: { label: "Group Phase", color: "text-orange-400", bg: "bg-orange-400/10", icon: Users },
    // Legacy phases for backward compatibility
    matching: { label: "Matching", color: "text-green-400", bg: "bg-green-400/10", icon: BarChart3 },
    waiting2: { label: "Waiting for Round 2", color: "text-yellow-300", bg: "bg-yellow-300/10", icon: Clock },
    matching2: { label: "Matching Round 2", color: "text-pink-400", bg: "bg-pink-400/10", icon: BarChart3 },
  }

  // Ensure currentPhase is always a string
  const safeCurrentPhase = currentPhase || "registration"
  
  const currentPhaseConfig = phaseConfig[safeCurrentPhase as keyof typeof phaseConfig] || {
    label: "Unknown",
    color: "text-gray-400",
    bg: "bg-gray-400/10",
    icon: AlertCircle
  }

  const sendAnnouncement = async () => {
    if (!announcement.trim()) return
    
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set-announcement",
        message: announcement,
        type: announcementType
      }),
    })
    
    if (res.ok) {
      setAnnouncement("")
      setShowAnnouncementModal(false)
      fetchParticipants() // Refresh to get updated state
      alert("✅ Announcement sent!")
    } else {
      alert("❌ Failed to send announcement")
    }
  }

  const clearAnnouncement = async () => {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear-announcement" }),
    })
    
    if (res.ok) {
      setCurrentAnnouncement(null)
      fetchParticipants()
      alert("✅ Announcement cleared!")
    } else {
      alert("❌ Failed to clear announcement")
    }
  }

  const toggleEmergencyPause = async () => {
    const newPausedState = !emergencyPaused
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set-emergency-pause",
        paused: newPausedState
      }),
    })
    
    if (res.ok) {
      setEmergencyPaused(newPausedState)
      fetchParticipants()
      alert(`✅ Emergency ${newPausedState ? 'pause' : 'resume'} activated!`)
    } else {
      alert("❌ Failed to toggle emergency pause")
    }
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 text-white p-8 rounded-2xl shadow-2xl w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <Shield className="w-12 h-12 text-slate-300" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-200 to-slate-400 bg-clip-text text-transparent">
              Admin Access
            </h1>
            <p className="text-slate-400 text-sm">Enter your credentials to continue</p>
          </div>
          
          <div className="space-y-4">
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="password"
                placeholder="Enter Admin Password"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:border-slate-400 transition-all duration-300"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && login()}
              />
            </div>
            
            <button
              className="w-full bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 shadow-lg"
              onClick={login}
            >
              Access Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-slate-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-slate-400/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Header */}
      <div className="relative z-10 bg-white/5 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-slate-600 to-slate-700 p-2 rounded-xl">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-slate-200 to-slate-400 bg-clip-text text-transparent">
                Admin Dashboard
              </h1>
              <p className="text-slate-400 text-sm">Participant Management System</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Current Time Display */}
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl">
              <Clock className="w-4 h-4 text-blue-400" />
              <div className="text-right">
                <div className="text-white font-mono text-sm">
                  {currentTime.toLocaleTimeString('ar-SA', { 
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </div>
                <div className="text-slate-400 text-xs">
                  {currentTime.toLocaleDateString('ar-SA', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short'
                  })}
                </div>
              </div>
            </div>
          
            <div className="flex items-center gap-3">
              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 transition-all duration-300"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Phase Control */}
      <div className="relative z-10 bg-white/5 backdrop-blur-xl border-b border-white/10 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${currentPhaseConfig.bg} border border-white/20`}>
              <currentPhaseConfig.icon className={`w-4 h-4 ${currentPhaseConfig.color}`} />
              <span className={`font-medium ${currentPhaseConfig.color}`}>
                {currentPhaseConfig.label}
              </span>
            </div>
            

            
                         <select
               value={safeCurrentPhase}
               onChange={(e) => updatePhase(e.target.value)}
               className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-slate-400/50 transition-all duration-300"
               style={{
                 color: 'white',
                 backgroundColor: 'rgba(15, 23, 42, 0.8)'
               }}
             >
               <option value="registration" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Registration</option>
               <option value="form" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Form</option>
               <option value="waiting" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Waiting</option>
               <option value="round_1" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Round 1</option>
               <option value="waiting_2" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Waiting 2</option>
                             <option value="round_2" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Round 2</option>
              {/* <option value="waiting_3" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Waiting 3</option>
              <option value="round_3" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Round 3</option>
              <option value="waiting_4" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Waiting 4</option>
              <option value="round_4" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Round 4</option> */}
              <option value="group_phase" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Group Phase</option>
             </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2">
              <span className="text-slate-300 text-sm">Total: </span>
              <span className="font-bold text-white">{participants.length}</span>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2">
              <span className="text-slate-300 text-sm">Waiting: </span>
              <span className="font-bold text-white">{waitingCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 p-6 max-w-7xl mx-auto">
        {/* Action Bar */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search participants..."
                  className="pl-10 pr-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/50 transition-all duration-300"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={manualNumber ?? ""}
                  onChange={(e) => setManualNumber(Number(e.target.value))}
                  placeholder="رقم المشارك"
                  className="w-32 px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/50 transition-all duration-300"
                />
                <button
                  onClick={async () => {
                    setLoading(true)
                    const res = await fetch("/api/token-handler", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "create" }),
                    })
                    const data = await res.json()
                    if (data.secure_token) {
                      setQrParticipant({
                        assigned_number: data.assigned_number,
                        secure_token: data.secure_token,
                      })
                      fetchParticipants()
                    } else {
                      alert("❌ فشل في توليد الرابط")
                    }
                    setLoading(false)
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl transition-all duration-300"
                >
                  <Plus className="w-4 h-4" />
                  Auto Assign Number
                </button>

                <button
                  disabled={!manualNumber}
                  onClick={async () => {
                    const res = await fetch("/api/token-handler", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "create", assigned_number: manualNumber }),
                    })
                    const data = await res.json()
                    if (data.secure_token) {
                      setQrParticipant({
                        assigned_number: manualNumber,
                        secure_token: data.secure_token,
                      })
                      setManualNumber(null)
                      fetchParticipants()
                    } else {
                      alert("❌ فشل في توليد الرابط")
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl disabled:opacity-50 transition-all duration-300"
                >
                  <QrCode className="w-4 h-4" />
                  Manual QR
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  if (!confirm("Assign table numbers to everyone?")) return
                  await fetch("/api/admin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "set-table" }),
                  })
                  fetchParticipants()
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl transition-all duration-300"
              >
                <Table2 className="w-4 h-4" />
                Auto Assign Tables
              </button>

              <button
                onClick={async () => {
                  if (!confirm("Are you sure you want to advance to the next phase?")) return
                  setLoading(true)
                  const res = await fetch("/api/admin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "advance-phase", currentPhase: safeCurrentPhase }),
                  })
                  const data = await res.json()
                  if (res.ok) {
                    alert(`✅ Phase advanced to ${data.new_phase}\n\n🚀 All players instantly transition to new phase!\n⚡ Change visible within 2 seconds!`)
                    fetchParticipants()
                  } else {
                    alert("❌ Failed to advance phase")
                  }
                  setLoading(false)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl transition-all duration-300"
              >
                <ChevronRight className="w-4 h-4" />
                Advance Phase
              </button>

              <button
                onClick={async () => {
                  if (!confirm("Are you sure you want to generate matches using the new personality-based algorithm?")) return
                  setLoading(true)
                  const res = await fetch("/api/admin/trigger-match", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                  })
                  const data = await res.json()
                  if (res.ok) {
                    alert(`✅ ${data.message}\n\nMatches created: ${data.count}`)
                    fetchParticipants()
                  } else {
                    alert("❌ Failed to generate matches: " + (data.error || "Unknown error"))
                  }
                  setLoading(false)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl transition-all duration-300"
              >
                <RefreshCcw className="w-4 h-4" />
                Generate Matches
              </button>

              <button
                onClick={async () => {
                  if (!confirm("Generate group matches? This will create groups of 3-4 people based on MBTI compatibility.")) return
                  setLoading(true)
                  const res = await fetch("/api/admin/trigger-match", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ matchType: "group" }),
                  })
                  const data = await res.json()
                  if (res.ok) {
                    alert(`✅ ${data.message}\n\nGroups created: ${data.count}\n\nGroup details:\n${data.groups?.map((g: any) => `Group ${g.group_number}: [${g.participants.join(', ')}] - Score: ${g.score}%`).join('\n') || 'No details available'}`)
                    fetchParticipants()
                  } else {
                    alert("❌ Failed to generate group matches: " + (data.error || "Unknown error"))
                  }
                  setLoading(false)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl transition-all duration-300"
              >
                <Users className="w-4 h-4" />
                Generate Groups
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Control Panel */}
      <div className="relative z-10 bg-white/5 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-6xl mx-auto p-6">
          {/* Timer Control Section */}
          <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 backdrop-blur-sm border border-white/20 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Clock className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-blue-300">Timer Control</h3>
                    <p className="text-slate-400 text-sm">Manage session timers globally</p>
                  </div>
                </div>
                
                {globalTimerActive ? (
                  <div className="flex items-center gap-3 px-4 py-2 bg-green-500/20 border border-green-500/30 rounded-xl">
                    <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                    <div className="text-right">
                      <div className="text-green-300 font-medium">
                        {globalTimerRound === 0 ? 'Group Phase' : `Round ${globalTimerRound}`} Active
                      </div>
                      <div className="text-green-200 text-sm font-mono">
                        {Math.floor(globalTimerRemaining / 60)}:{(globalTimerRemaining % 60).toString().padStart(2, '0')} remaining
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2 bg-slate-500/20 border border-slate-500/30 rounded-xl">
                    <div className="w-3 h-3 bg-slate-400 rounded-full"></div>
                    <div className="text-slate-300 font-medium">
                      No active timer
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!globalTimerActive ? (
                  <>
                    <button
                      onClick={() => startGlobalTimer(1)}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      <Clock className="w-4 h-4" />
                      Round 1 (30min)
                    </button>
                    <button
                      onClick={() => startGlobalTimer(2)}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      <Clock className="w-4 h-4" />
                      Round 2 (30min)
                    </button>
                    <button
                      onClick={() => startGlobalTimer(0)}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      <Users className="w-4 h-4" />
                      Group (30min)
                    </button>
                  </>
                ) : (
                  <button
                    onClick={endGlobalTimer}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl"
                  >
                    <X className="w-4 h-4" />
                    End Timer
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Action Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Phase & Round Control */}
            <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 backdrop-blur-sm border border-white/20 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Settings className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-purple-300">Phase Control</h3>
                  <p className="text-slate-400 text-sm">Manage event phases</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${currentPhaseConfig.bg} border border-white/20 flex-1`}>
                    <currentPhaseConfig.icon className={`w-4 h-4 ${currentPhaseConfig.color}`} />
                    <span className={`font-medium ${currentPhaseConfig.color}`}>
                      {currentPhaseConfig.label}
                    </span>
                  </div>
                  
                  <select
                    value={safeCurrentPhase}
                    onChange={(e) => updatePhase(e.target.value)}
                    className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-400/50 transition-all duration-300"
                    style={{
                      color: 'white',
                      backgroundColor: 'rgba(15, 23, 42, 0.8)'
                    }}
                  >
                    <option value="registration" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Registration</option>
                    <option value="form" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Form</option>
                    <option value="waiting" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Waiting</option>
                    <option value="round_1" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Round 1</option>
                    <option value="waiting_2" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Waiting 2</option>
                    <option value="round_2" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Round 2</option>
                    <option value="group_phase" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Group Phase</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300 text-sm">Total Rounds:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateRounds(Math.max(2, currentRounds - 1))}
                      className="p-1 rounded bg-slate-600 hover:bg-slate-500 text-white transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="px-3 py-1 bg-slate-700 rounded text-white font-medium min-w-[2rem] text-center">
                      {currentRounds}
                    </span>
                    <button
                      onClick={() => updateRounds(Math.min(6, currentRounds + 1))}
                      className="p-1 rounded bg-slate-600 hover:bg-slate-500 text-white transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="text-slate-400 text-xs ml-2">
                      (Optimal: {optimalRounds})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 backdrop-blur-sm border border-white/20 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Activity className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-green-300">Quick Actions</h3>
                  <p className="text-slate-400 text-sm">Common admin tasks</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setManualNumber(null)}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-lg transition-all duration-300 text-sm"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Refresh
                </button>

                <button
                  onClick={openMatrix}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 text-white rounded-lg transition-all duration-300 text-sm"
                >
                  <BarChart3 className="w-4 h-4" />
                  Matrix
                </button>

                <button
                  onClick={() => setShowAnnouncementModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg transition-all duration-300 text-sm"
                >
                  <Activity className="w-4 h-4" />
                  Announce
                </button>

                <button
                  onClick={toggleEmergencyPause}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 text-sm ${
                    emergencyPaused
                      ? "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white"
                      : "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
                  }`}
                >
                  <AlertCircle className="w-4 h-4" />
                  {emergencyPaused ? "Resume" : "E-Pause"}
                </button>

                <button
                  onClick={async () => {
                    if (!confirm("Generate matches without AI vibe analysis? (All participants will get full vibe score)")) return
                    setLoading(true)
                    const res = await fetch("/api/admin/trigger-match", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ skipAI: true }),
                    })
                    const data = await res.json()
                    if (res.ok) {
                      alert(`✅ ${data.message}\n\nMatches created: ${data.count}`)
                      fetchParticipants()
                    } else {
                      alert("❌ Failed to generate matches: " + (data.error || "Unknown error"))
                    }
                    setLoading(false)
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-lg transition-all duration-300 text-sm"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Generate (No AI)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Participants Section */}
      <div className="relative z-10 flex-1 overflow-hidden">
        <div className="max-w-6xl mx-auto p-6">
          {/* Participants List */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-slate-300 text-sm">Current Rounds:</label>
                  <select
                    value={currentRounds}
                    onChange={(e) => updateRounds(Number(e.target.value))}
                    className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-slate-400/50 transition-all duration-300"
                  >
                    {[2, 3, 4, 5, 6].map(rounds => (
                      <option key={rounds} value={rounds} style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>
                        {rounds} rounds
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => updateRounds(optimalRounds)}
                  className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg transition-all duration-300 text-sm"
                >
                  <Settings className="w-3 h-3" />
                  Use Optimal
                </button>
              </div>
              <div className="text-slate-400 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Participants:</span>
                  <span className="text-white">{participants.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max pairs per round:</span>
                  <span className="text-white">{Math.floor(participants.length / 2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total possible pairs:</span>
                  <span className="text-white">{participants.length > 0 ? Math.floor((participants.length * (participants.length - 1)) / 2) : 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Repeats with {currentRounds} rounds:</span>
                  <span className={`${currentRounds > optimalRounds ? 'text-yellow-400' : 'text-green-400'}`}>
                    {participants.length > 0 ? Math.max(0, (currentRounds * Math.floor(participants.length / 2)) - Math.floor((participants.length * (participants.length - 1)) / 2)) : 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Statistics Display */}
          {participantStats && (
            <div className="mt-4 p-4 rounded-xl border border-white/20 bg-white/5">
              <h3 className="text-white font-semibold mb-3">Participant Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-400">{participantStats.total_participants}</p>
                  <p className="text-slate-400 text-sm">Total Registered</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-400">{participantStats.form_completed}</p>
                  <p className="text-slate-400 text-sm">Form Completed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-400">{participantStats.waiting_count}</p>
                  <p className="text-slate-400 text-sm">Currently Waiting</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-400">{participantStats.current_round_participants}</p>
                  <p className="text-slate-400 text-sm">In Current Round</p>
                </div>
              </div>
            </div>
          )}

          {/* Current Announcement Display */}
          {currentAnnouncement?.message && (
            <div className="mt-4 p-4 rounded-xl border border-white/20 bg-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    currentAnnouncement.type === "warning" ? "bg-yellow-400" :
                    currentAnnouncement.type === "error" ? "bg-red-400" :
                    currentAnnouncement.type === "success" ? "bg-green-400" :
                    "bg-blue-400"
                  }`}></div>
                  <div>
                    <p className="text-white font-medium">{currentAnnouncement.message}</p>
                    <p className="text-slate-400 text-sm">
                      {new Date(currentAnnouncement.time).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={clearAnnouncement}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Participants Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="text-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
              <p className="text-slate-400">Loading participants...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredParticipants.map((p) => (
              <div
                key={p.id}
                className={`group bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 cursor-pointer transform hover:scale-105 ${
                  selectedParticipants.has(p.assigned_number) ? 'ring-2 ring-slate-400 bg-slate-400/10' : ''
                }`}
                onClick={() => setDetailParticipant(p)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-gradient-to-r from-slate-600 to-slate-700 p-3 rounded-xl">
                    <UserRound className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleParticipantSelection(p.assigned_number)
                      }}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      {selectedParticipants.has(p.assigned_number) ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">#{p.assigned_number}</div>
                    <div className="flex items-center justify-center gap-1 text-slate-400 text-sm">
                      <Table2 className="w-4 h-4" />
                      {p.table_number ?? "Unassigned"}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400 truncate italic">
                      "MBTI: {p.survey_data?.mbtiType || p.mbti_personality_type || "No response"}"
                    </div>
                    <div className="text-xs text-slate-400 truncate italic">
                      "Attachment: {p.survey_data?.attachmentStyle || p.attachment_style || "No response"}"
                    </div>
                    <div className="text-xs text-slate-400 truncate italic">
                      "Communication: {p.survey_data?.communicationStyle || p.communication_style || "No response"}"
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-slate-400" />
                    <span className="text-xs text-slate-400">View Details</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredParticipants.length === 0 && !loading && (
          <div className="text-center py-20">
            <Users className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-300 mb-2">No participants found</h3>
            <p className="text-slate-400">Try adjusting your search criteria</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailParticipant && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl w-full max-w-md space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <UserRound className="w-5 h-5" />
                Participant #{detailParticipant.assigned_number}
              </h2>
              <button
                onClick={() => setDetailParticipant(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-white/5 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Table Number:</span>
                  <input
                    type="number"
                    defaultValue={detailParticipant.table_number ?? ""}
                    onBlur={async (e) => {
                      const table_number = Number(e.target.value)
                      await fetch("/api/admin", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "update-table",
                          assigned_number: detailParticipant.assigned_number,
                          table_number,
                        }),
                      })
                      fetchParticipants()
                    }}
                    className="w-20 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-center focus:outline-none focus:ring-2 focus:ring-slate-400/50"
                  />
                </div>
                
                <div className="space-y-2">
                  <div><span className="text-slate-400">MBTI Type:</span> <span className="text-white">{detailParticipant.survey_data?.mbtiType || detailParticipant.mbti_personality_type || "No response"}</span></div>
                  <div><span className="text-slate-400">Attachment Style:</span> <span className="text-white">{detailParticipant.survey_data?.attachmentStyle || detailParticipant.attachment_style || "No response"}</span></div>
                  <div><span className="text-slate-400">Communication Style:</span> <span className="text-white">{detailParticipant.survey_data?.communicationStyle || detailParticipant.communication_style || "No response"}</span></div>
                  <div><span className="text-slate-400">Lifestyle Preferences:</span> <span className="text-white">{detailParticipant.survey_data?.lifestylePreferences || "No response"}</span></div>
                  <div><span className="text-slate-400">Core Values:</span> <span className="text-white">{detailParticipant.survey_data?.coreValues || "No response"}</span></div>
                  <div><span className="text-slate-400">Vibe Description:</span> <span className="text-white">{detailParticipant.survey_data?.vibeDescription || "No response"}</span></div>
                  <div><span className="text-slate-400">Ideal Person:</span> <span className="text-white">{detailParticipant.survey_data?.idealPersonDescription || "No response"}</span></div>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => deleteParticipant(detailParticipant.assigned_number)}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 rounded-xl transition-all duration-300"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
              <button
                onClick={() => setQrParticipant(detailParticipant)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 rounded-xl transition-all duration-300"
              >
                <QrCode className="w-4 h-4" />
                QR Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {qrParticipant && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl text-center w-80 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                QR Code: #{qrParticipant.assigned_number}
              </h2>
              <button
                onClick={() => setQrParticipant(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="bg-white rounded-xl p-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  `${window.location.origin}/welcome?token=${qrParticipant.secure_token}`
                )}`}
                alt="QR Code"
                className="mx-auto"
              />
            </div>
            
            <div className="space-y-3">
              <p className="text-xs break-all text-slate-300 bg-white/5 rounded-lg p-3">
                {`${window.location.origin}/welcome?token=${qrParticipant.secure_token}`}
              </p>
              
              <button
                onClick={() => copyToClipboard(`${window.location.origin}/welcome?token=${qrParticipant.secure_token}`)}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-xl transition-all duration-300"
              >
                {copied ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Link
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Announcement Modal */}
      {showAnnouncementModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl w-full max-w-md space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Send Announcement
              </h2>
              <button
                onClick={() => setShowAnnouncementModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Message Type</label>
                <select
                  value={announcementType}
                  onChange={(e) => setAnnouncementType(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-slate-400/50"
                >
                  <option value="info" className="bg-slate-800">Info (Blue)</option>
                  <option value="success" className="bg-slate-800">Success (Green)</option>
                  <option value="warning" className="bg-slate-800">Warning (Yellow)</option>
                  <option value="error" className="bg-slate-800">Error (Red)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Message</label>
                <textarea
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  placeholder="Enter your announcement message..."
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/50 resize-none"
                  rows={4}
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowAnnouncementModal(false)}
                className="flex-1 px-4 py-2 bg-slate-500/20 border border-slate-500/30 text-slate-300 hover:bg-slate-500/30 rounded-xl transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={sendAnnouncement}
                disabled={!announcement.trim()}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl disabled:opacity-50 transition-all duration-300"
              >
                Send Announcement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear History Button */}
      {authenticated && (
        <button
          onClick={async () => {
            if (!window.confirm("Are you sure you want to clear all match history? This cannot be undone.")) return;
            const res = await fetch("/api/get-my-matches", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ admin_token: ADMIN_TOKEN })
            });
            const data = await res.json();
            if (data.success) {
              alert("✅ All match history cleared.");
              fetchParticipants();
            } else {
              alert("❌ Failed to clear history: " + (data.error || "Unknown error"));
            }
          }}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded shadow-lg mb-4"
        >
          <Trash2 className="inline-block mr-2" /> Clear History
        </button>
      )}
    </div>
  )
}
