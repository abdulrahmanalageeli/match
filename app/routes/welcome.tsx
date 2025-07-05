import React, { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { X } from "lucide-react"

import {
  ChevronRightIcon,
  ChevronLeftIcon,
  SunIcon,
  MoonIcon,
  Brain,
  Users,
  Sparkles,
  Cpu,
  Zap,
  Target,
  Heart,
  Shield,
  AlertTriangle,
  Clock,
  UserCheck,
  MessageSquare,
  Activity,
} from "lucide-react"
import { Button } from "../../components/ui/button"
import { Timeline, TimelineItem } from "../../components/ui/timeline"
import { Avatar, AvatarFallback } from "../../components/ui/avatar"
import "../../app/app.css"
import MatchResult from "./MatchResult"

const SleekTimeline = ({ currentStep, totalSteps, dark, formCompleted, currentRound, totalRounds }: { currentStep: number; totalSteps: number; dark: boolean; formCompleted?: boolean; currentRound?: number; totalRounds?: number }) => {
  const stepLabels = ["المجموعات", "الجولة ٤", "الجولة ٣", "الجولة ٢", "الجولة ١", "تحليل", "النموذج"];
  // Reverse for RTL
  const steps = Array.from({ length: totalSteps });
  return (
    <div className="w-full max-w-[90%] mx-auto mb-8 flex flex-col items-center" dir="rtl">
      <div className="relative w-full flex flex-row-reverse items-center justify-between" style={{ height: 32 }}>
        {/* Timeline line */}
        <div className={`absolute left-0 right-0 top-1/2 h-1 rounded-full ${dark ? 'bg-slate-700/60' : 'bg-blue-100/80'}`} style={{ transform: 'translateY(-50%)' }} />
        {steps.map((_, i) => {
          // For RTL, currentStep is counted from the right
          const rtlIndex = totalSteps - 1 - i;
          const isCurrent = rtlIndex === currentStep;
          const isPast = rtlIndex < currentStep;
          const isFormStep = rtlIndex === 0; // Form step (rightmost in RTL)
          const isCompleted = isPast || (isFormStep && formCompleted);
          
          return (
            <div key={i} className="relative z-10 flex flex-col items-center" style={{ width: 1, flex: 1 }}>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                  isCurrent
                    ? dark
                      ? 'bg-cyan-400 border-cyan-300 shadow-lg shadow-cyan-400/40'
                      : 'bg-blue-500 border-blue-400 shadow-lg shadow-blue-400/40'
                    : isCompleted
                      ? dark
                        ? 'bg-green-500 border-green-400'
                        : 'bg-green-400 border-green-300'
                      : dark
                        ? 'bg-slate-800 border-slate-700'
                        : 'bg-gray-200 border-gray-300'
                }`}
                style={{ boxShadow: isCurrent ? `0 0 12px 2px ${dark ? '#22d3ee88' : '#3b82f688'}` : undefined }}
              >
                {/* AI-themed indicators for completed steps */}
                {isCompleted && (
                  <div className="relative">
                    {/* Neural network nodes */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-1 h-1 bg-white rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                    {/* AI check mark */}
                    <svg className="w-3 h-3 text-white relative z-10" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
              <span className={`mt-2 text-xs font-medium ${isCurrent ? (dark ? 'text-cyan-300' : 'text-blue-600') : isCompleted ? (dark ? 'text-green-400' : 'text-green-600') : (dark ? 'text-slate-400' : 'text-gray-500')}`}>{stepLabels[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function WelcomePage() {
  const [step, setStep] = useState(0)
  const [dark, setDark] = useState(true) // Default to dark mode
  const [assignedNumber, setAssignedNumber] = useState<number | null>(null)

  const [freeTime, setFreeTime] = useState("")
  const [friendDesc, setFriendDesc] = useState("")
  const [preference, setPreference] = useState("")
  const [uniqueTrait, setUniqueTrait] = useState("")
  const [personalitySummary, setPersonalitySummary] = useState("")
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(30)
  const [matchResult, setMatchResult] = useState<string | null>(null)
  const [matchReason, setMatchReason] = useState<string>("")
  const [phase, setPhase] = useState<"registration" | "form" | "waiting" | "round_1" | "waiting_2" | "round_2" | "waiting_3" | "round_3" | "waiting_4" | "round_4" | "group_phase" | null>(null)
  const [tableNumber, setTableNumber] = useState<number | null>(null)
  const [compatibilityScore, setCompatibilityScore] = useState<number | null>(null)
  const [isScoreRevealed, setIsScoreRevealed] = useState(false)
  const [conversationStarted, setConversationStarted] = useState(false)
  const [conversationTimer, setConversationTimer] = useState(300) // 5 minutes
  const [feedbackAnswers, setFeedbackAnswers] = useState({
    enjoyment: "",
    connection: "",
    wouldMeetAgain: "",
    overallRating: ""
  })
  const token = useSearchParams()[0].get("token")
const [isResolving, setIsResolving] = useState(true)
  const [typewriterText, setTypewriterText] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [currentRound, setCurrentRound] = useState(1)
  const [totalRounds, setTotalRounds] = useState(4)
  const [announcement, setAnnouncement] = useState<any>(null)
  const [emergencyPaused, setEmergencyPaused] = useState(false)
  const [welcomeText, setWelcomeText] = useState("")
  const [welcomeTyping, setWelcomeTyping] = useState(false)
  const [announcementProgress, setAnnouncementProgress] = useState(0)
  const [showFormFilledPrompt, setShowFormFilledPrompt] = useState(false)
  const [pendingMatchRound, setPendingMatchRound] = useState<number | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historyMatches, setHistoryMatches] = useState<MatchResultEntry[]>([])
  const [modalStep, setModalStep] = useState<null | "feedback" | "result">(null)
  const [analysisStarted, setAnalysisStarted] = useState(false)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<MatchResultEntry | null>(null)
  const [showHistoryDetail, setShowHistoryDetail] = useState(false)
  const [animationStep, setAnimationStep] = useState(0)
  const [showRegistrationContent, setShowRegistrationContent] = useState(false)

  const prompts = [
    "ما أكثر شيء استمتعت به مؤخراً؟",
    "لو كان بإمكانك السفر لأي مكان، أين ستذهب ولماذا؟",
    "ما هي هوايتك المفضلة؟",
    "ما هو أفضل كتاب أو فيلم شاهدته مؤخراً؟",
    "لو كان بإمكانك تعلم مهارة جديدة، ماذا ستكون؟",
    "ما هو أكثر شيء تفتخر به في نفسك؟",
    "ما هو حلمك الكبير في الحياة؟",
    "ما هو أكثر شيء يجعلك تضحك؟"
  ];
  const [promptIndex, setPromptIndex] = useState(0);

  // Typewriter effect for welcome message
  useEffect(() => {
    if (step !== -1 || !assignedNumber) {
      setWelcomeText("")
      setWelcomeTyping(false)
      return
    }

    const fullText = `مرحباً بك لاعب رقم ${assignedNumber} في نظام التوافق الذكي! \n\nسنقوم بتحليل شخصيتك ومطابقتك مع أشخاص آخرين بناءً على اهتماماتك وصفاتك.`
    
    setWelcomeTyping(true)
    setWelcomeText("")
    
    let index = 0
    const typeInterval = setInterval(() => {
      if (index < fullText.length) {
        setWelcomeText(fullText.substring(0, index + 1))
        index++
      } else {
        clearInterval(typeInterval)
        setWelcomeTyping(false)
      }
    }, 50) // Speed of typing

    return () => clearInterval(typeInterval)
  }, [step, assignedNumber])

  // Typewriter effect for AI description
  useEffect(() => {
    if (!analysisStarted || !personalitySummary || personalitySummary === "ما تم إنشاء ملخص.") {
      setTypewriterText("")
      setIsTyping(false)
      return
    }

    setIsTyping(true)
    setTypewriterText("")
    
    let index = 0
    const typeInterval = setInterval(() => {
      if (index < personalitySummary.length) {
        setTypewriterText(personalitySummary.substring(0, index + 1))
        index++
      } else {
        clearInterval(typeInterval)
        setIsTyping(false)
      }
    }, 30) // Speed of typing

    return () => clearInterval(typeInterval)
  }, [analysisStarted, personalitySummary])

  useEffect(() => {
    const resolveToken = async () => {
      if (!token) return

      try {
        const res = await fetch("/api/token-handler", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve", secure_token: token }),
        })
        const data = await res.json()
        if (data.success) {
          setAssignedNumber(data.assigned_number);
          if (data.summary) {
            setPersonalitySummary(data.summary)
          }
          const hasFilledForm = data.q1 && data.q2 && data.q3 && data.q4;
          setStep(-1);
          const res2 = await fetch("/api/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "event-phase",
              match_id: "00000000-0000-0000-0000-000000000000",
            }),
          });
          
          if (!res2.ok) {
            console.error("Failed to fetch event phase:", res2.status, res2.statusText);
            // Set default values if API fails
            setPhase("registration");
            setCurrentRound(1);
            setTotalRounds(4);
          } else {
            const phaseData = await res2.json();
            setPhase(phaseData.phase || "registration");
            setCurrentRound(phaseData.current_round || 1);
            setTotalRounds(phaseData.total_rounds || 4);

            // --- NEW LOGIC ---
            if (hasFilledForm) {
              if (phaseData.phase !== "form") {
                // Registration closed but user filled form, skip to correct step
                if (phaseData.phase && phaseData.phase.startsWith("round_")) {
                  const roundNumber = parseInt(phaseData.phase.split('_')[1]);
                  setPendingMatchRound(roundNumber);
                  setStep(4); // Show matches
                } else if (phaseData.phase && phaseData.phase.startsWith("waiting_")) {
                  setStep(3); // Show analysis/waiting
                } else if (phaseData.phase === "group_phase") {
                  setStep(7); // Show group phase
                }
              } else {
                // In form phase and already filled form, show prompt
                setShowFormFilledPrompt(true);
              }
            }
            // --- END NEW LOGIC ---
          }
        }
      } catch (err) {
        console.error("Error resolving token:", err)
      } finally {
        setIsResolving(false)
      }
    }
    resolveToken()
  }, [token])

  useEffect(() => {
    if (assignedNumber && pendingMatchRound) {
      fetchMatches(pendingMatchRound)
      setPendingMatchRound(null)
    }
  }, [assignedNumber, pendingMatchRound])

  // Combined real-time updates for all steps
  useEffect(() => {
    // Don't start polling until initial resolution is complete
    if (isResolving) return

    const interval = setInterval(async () => {
      try {
        // Fetch both phase and event state in one call
        const res = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get-event-state", match_id: "00000000-0000-0000-0000-000000000000" }),
        })

        if (!res.ok) {
          console.error("Failed to fetch real-time updates:", res.status, res.statusText);
          return;
        }

        const data = await res.json()
        
        // Update phase
        setPhase(data.phase || "registration")
        
        // Update announcements and emergency pause
        setAnnouncement({
          message: data.announcement,
          type: data.announcement_type,
          time: data.announcement_time
        })
        setEmergencyPaused(data.emergency_paused || false)

        // Handle step transitions based on phase changes
        if (assignedNumber) {
          // Update current round and total rounds
          setCurrentRound(data.current_round || 1);
          setTotalRounds(data.total_rounds || 4);
          
          // Handle phase transitions
          if (data.phase && data.phase.startsWith("round_")) {
            const roundNumber = parseInt(data.phase.split('_')[1]);
            if (step === 3 || step === 5) { // From waiting to round
              await fetchMatches(roundNumber);
              setStep(4);
              // Reset conversation state for new round
              setConversationTimer(300);
              setConversationStarted(false);
              setModalStep(null);
              setIsScoreRevealed(false);
            }
          } else if (data.phase && data.phase.startsWith("waiting_")) {
            if (step === 4) { // From round to waiting
              setStep(5);
            }
          } else if (data.phase === "group_phase") {
            if (step !== 7) {
              setStep(7);
            }
          } else if (data.phase === "form") {
            if (step === -1) setStep(0); // Welcome landing page -> System intro
            if (step === 0) setStep(2); // System intro -> Form (skip step 1 since we have token)
            if (step === 1) setStep(2); // Form -> Analysis
          } else if (data.phase === "waiting") {
            if (step === 2) setStep(3);
          }
        }
      } catch (err) {
        console.error("Failed to fetch real-time updates", err)
      }
    }, 3000) // every 3 seconds
  
    return () => clearInterval(interval)
  }, [step, currentRound, assignedNumber, isResolving])
    
  const next = () => setStep((s) => Math.min(s + 1, 6))
  const restart = () => {
    setStep(-1)
    setPersonalitySummary("")
  }
  const previous = () => setStep((s) => Math.max(s - 1, -2))

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  const FancyNextButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <Button 
      onClick={onClick} 
      className="spring-btn relative ps-12 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105"
    >
      {label}
      <span className="bg-white/20 pointer-events-none absolute inset-y-0 start-0 flex w-9 items-center justify-center rounded-s-md">
        <ChevronLeftIcon className="opacity-80" size={16} aria-hidden="true" />
      </span>
    </Button>
  )

  const FancyPreviousButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <Button 
      onClick={onClick} 
      className="spring-btn relative pe-12 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105"
    >
      {label}
      <span className="bg-white/20 pointer-events-none absolute inset-y-0 end-0 flex w-9 items-center justify-center rounded-e-md">
        <ChevronRightIcon className="opacity-80" size={16} aria-hidden="true" />
      </span>
    </Button>
  )
  
  const startConversation = () => {
    setConversationStarted(true)
  }

  const skipConversation = () => {
    setConversationTimer(0)
    setModalStep("feedback")
  }
  
  const handleSubmit = async () => {
    setLoading(true)
    try {
      // 1. Save participant
      const res1 = await fetch("/api/save-participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_number: assignedNumber,
          q1: freeTime,
          q2: friendDesc,
          q3: preference,
          q4: uniqueTrait,
        }),
      })
      const data1 = await res1.json()
      if (!res1.ok) throw new Error(data1.error)
  
      // 2. Generate summary
      const res2 = await fetch("/api/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responses: {
            q1: freeTime,
            q2: friendDesc,
            q3: preference,
            q4: uniqueTrait,
          },
        }),
      })
      const data2 = await res2.json()
      setPersonalitySummary(data2.summary || "ما قدرنا نولّد تحليل شخصيتك.")
      await fetch("/api/save-participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_number: assignedNumber,
          summary: data2.summary || "ما قدرنا نولّد تحليل شخصيتك.",
        }),
      })
      // Move to waiting/analysis step immediately after form submission
      setAnalysisStarted(true)
      setStep(3)
    } catch (err) {
      console.error("Submit error:", err)
      setPersonalitySummary("ما قدرنا نولّد تحليل شخصيتك.")
      // Don't auto-advance on error either
    } finally {
      setLoading(false)
    }
  }
      
  type MatchResultEntry = {
    with: string
    type: string
    reason: string
    round: number
    table_number: number | null
    score: number
  }

  type GroupMatchEntry = {
    group_id: string
    participants: string[]
    reason: string
    table_number: number | null
    score: number
  }
  
  const fetchMatches = async (roundOverride?: number) => {
    if (!assignedNumber) return
    
    const round = roundOverride || currentRound
    console.log(`Fetching matches for round ${round}`)
    
    try {
      const res = await fetch("/api/get-my-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_number: assignedNumber })
      })
      
      if (!res.ok) {
        console.error("Failed to fetch matches:", res.status, res.statusText)
        return
      }
      
      const data = await res.json()
      const matches = data.matches || []
      
      // Find current round match
      const currentRoundMatch = matches.find((m: MatchResultEntry) => m.round === round)
      
      if (currentRoundMatch) {
        setMatchResult(currentRoundMatch.with)
        setMatchReason(currentRoundMatch.reason)
        setCompatibilityScore(currentRoundMatch.score)
        setTableNumber(currentRoundMatch.table_number)
        
        // Incrementally add to history if not already present
        setHistoryMatches(prev => {
          const exists = prev.some(m => m.with === currentRoundMatch.with && m.round === currentRoundMatch.round)
          if (!exists) {
            return [...prev, currentRoundMatch]
          }
          return prev
        })
      }
    } catch (err) {
      console.error("Error fetching matches:", err)
    }
  }

  const fetchGroupMatches = async () => {
    try {
      const myMatches = await fetch("/api/get-my-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_number: assignedNumber, match_type: "group" }),
      })
      const data = await myMatches.json()
      const matches = data.matches as GroupMatchEntry[]
      const match = matches[0]
      if (match) {
        setMatchResult(match.participants.join(", "))
        setMatchReason(match.reason)
        setTableNumber(match.table_number)
        setCompatibilityScore(match.score)
      }
    } catch (err) {
      setMatchResult("؟")
      setMatchReason("صار خطأ بالتوافق، حاول مره ثانية.")
    }
  }
  
  // Conversation timer effect
  useEffect(() => {
    if (!conversationStarted || conversationTimer <= 0 || emergencyPaused) return
  
    const interval = setInterval(() => {
      setConversationTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          setModalStep("feedback")
          return 0
        }
        return prev - 1
      })
    }, 1000)
  
    return () => clearInterval(interval)
  }, [conversationStarted, conversationTimer, emergencyPaused])

  // Announcement progress effect
  useEffect(() => {
    if (!announcement?.message) {
      setAnnouncementProgress(0)
      return
    }

    const duration = 10000 // 10 seconds
    const interval = 100 // Update every 100ms
    const increment = (interval / duration) * 100

    const timer = setInterval(() => {
      setAnnouncementProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer)
          setAnnouncement(null) // Auto-dismiss when complete
          return 100
        }
        return prev + increment
      })
    }, interval)

    return () => clearInterval(timer)
  }, [announcement?.message])

  const submitFeedback = () => {
    setIsScoreRevealed(true)
    setModalStep("result")
    
    // Incrementally update history when feedback is submitted
    if (assignedNumber && matchResult) {
      // Add current match to history immediately
      const currentMatch = {
        with: matchResult,
        type: "مباراة",
        reason: matchReason,
        round: currentRound,
        table_number: tableNumber,
        score: compatibilityScore || 0
      }
      
      setHistoryMatches(prev => {
        // Check if this match already exists in history
        const exists = prev.some(m => m.with === currentMatch.with && m.round === currentMatch.round)
        if (!exists) {
          return [...prev, currentMatch]
        }
        return prev
      })
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    if (modalStep === "result" && assignedNumber) {
      // History is now handled incrementally, no need to fetch all at once
      // The history is updated when feedback is submitted and when matches are fetched
    }
  }, [modalStep, assignedNumber]);

  // AI Animation Effect for Registration
  useEffect(() => {
    if (!token) {
      const handleShowContent = () => {
        setShowRegistrationContent(true)
      }
      
      document.addEventListener('showRegistrationContent', handleShowContent)
      
      return () => {
        document.removeEventListener('showRegistrationContent', handleShowContent)
      }
    }
  }, [token])

  // Registration UI if no token
  if (!token) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Animated Background Elements */}
        <div className="absolute inset-0">
          {/* Floating orbs */}
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className={`absolute rounded-full blur-xl opacity-20 animate-pulse ${
                i % 2 === 0 ? 'bg-cyan-400' : 'bg-blue-500'
              }`}
              style={{
                width: `${32 + (i % 3) * 24}px`,
                height: `${32 + (i % 4) * 20}px`,
                top: `${10 + (i * 10) % 70}%`,
                left: `${5 + (i * 13) % 85}%`,
                animationDelay: `${i * 0.7}s`,
                zIndex: 0,
              }}
            />
          ))}
        </div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%236B7280' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>

        {/* Main Content */}
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
          <div className="max-w-4xl w-full">
            {/* Initial Loading Animation */}
            {!showRegistrationContent && (
              <div className="text-center">
                <div className="relative inline-block mb-8">
                  {/* AI Loading Effect */}
                  <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-r from-cyan-600 to-blue-700 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse">
                    <Brain className="w-12 h-12 sm:w-16 sm:h-16 text-white animate-spin" />
                  </div>
                  
                  {/* Neural Network Animation */}
                  <div className="relative w-64 h-32 mx-auto mb-8">
                    {[...Array(6)].map((_, i) => (
                      <div
                        key={i}
                        className="absolute w-2 h-2 bg-cyan-400 rounded-full animate-ping"
                        style={{
                          left: `${20 + (i * 40)}px`,
                          top: `${20 + (i % 2) * 80}px`,
                          animationDelay: `${i * 0.2}s`,
                        }}
                      />
                    ))}
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={`line-${i}`}
                        className="absolute h-px bg-gradient-to-r from-cyan-400 to-transparent animate-pulse"
                        style={{
                          left: `${20 + (i * 40)}px`,
                          top: `${60 + (i % 2) * 20}px`,
                          width: '40px',
                          animationDelay: `${i * 0.3}s`,
                        }}
                      />
                    ))}
                  </div>
                  
                  <h1 className="text-2xl sm:text-4xl font-bold text-white mb-4 tracking-tight animate-in slide-in-from-bottom-4 duration-1000">
                    <div className="relative inline-block">
                      {/* Animated Background Glow */}
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 rounded-3xl blur-2xl opacity-30 animate-pulse"></div>
                      
                      {/* Main Logo Container */}
                      <div className="relative bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 sm:p-8 border border-cyan-400/30 shadow-2xl">
                        {/* Animated Border */}
                        <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 opacity-20 animate-spin" style={{ animationDuration: '8s' }}></div>
                        
                        {/* Logo Content */}
                        <div className="relative flex items-center justify-center gap-4 sm:gap-6">
                          {/* Left Icon */}
                          <div className="relative">
                            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center animate-pulse">
                              <Heart className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                            </div>
                            <div className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full animate-ping"></div>
                          </div>
                          
                          {/* Text with Gradient */}
                          <div className="relative">
                            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent font-extrabold text-2xl sm:text-4xl lg:text-6xl tracking-wider">
                              التوافق الأعمى
                            </span>
                            {/* Text Glow Effect */}
                            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent font-extrabold text-2xl sm:text-4xl lg:text-6xl tracking-wider blur-sm opacity-50 animate-pulse"></div>
                          </div>
                          
                          {/* Right Icon */}
                          <div className="relative">
                            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center animate-pulse">
                              <Brain className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                            </div>
                            <div className="absolute -top-2 -right-2 w-4 h-4 bg-cyan-500 rounded-full animate-ping" style={{ animationDelay: '0.5s' }}></div>
                          </div>
                        </div>
                        
                        {/* Floating Particles */}
                        <div className="absolute inset-0 overflow-hidden rounded-3xl">
                          {[...Array(8)].map((_, i) => (
                            <div
                              key={i}
                              className="absolute w-1 h-1 bg-cyan-400 rounded-full animate-ping"
                              style={{
                                left: `${15 + (i * 12)}%`,
                                top: `${25 + (i % 2) * 50}%`,
                                animationDelay: `${i * 0.2}s`,
                                animationDuration: '2s'
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </h1>
                  <p className="text-sm sm:text-xl text-cyan-100 max-w-2xl mx-auto leading-relaxed animate-in slide-in-from-bottom-4 duration-1000 delay-300">
                    جاري تحميل الذكاء الاصطناعي...
                  </p>
                </div>
              </div>
            )}

            {/* Final Registration Content */}
            {showRegistrationContent && (
              <>
                {/* Header Section */}
                <div className="text-center mb-8 sm:mb-12 animate-in slide-in-from-bottom-4 duration-1000">
                  <div className="relative inline-block mb-6 sm:mb-8">
                    <div className="absolute inset-0 rounded-2xl sm:rounded-3xl blur-xl sm:blur-2xl opacity-30 bg-gradient-to-r from-cyan-500 to-blue-600 animate-pulse"></div>
                    <div className="relative bg-gradient-to-r from-cyan-600 to-blue-700 rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-xl border border-cyan-400/30 shadow-2xl">
                      <div className="flex items-center justify-center gap-2 sm:gap-4 mb-4 sm:mb-6">
                        <Brain className="w-8 h-8 sm:w-12 sm:h-12 text-white animate-pulse" />
                        <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-200 animate-bounce" />
                        <Heart className="w-8 h-8 sm:w-12 sm:h-12 text-white animate-pulse" />
                      </div>
                      <h1 className="text-2xl sm:text-4xl lg:text-6xl font-bold text-white mb-3 sm:mb-4 tracking-tight">
                        نظام التوافق الذكي
                      </h1>
                      <p className="text-sm sm:text-xl text-cyan-100 max-w-2xl mx-auto leading-relaxed px-2">
                        اكتشف توأم روحك من خلال الذكاء الاصطناعي المتقدم
                      </p>
                    </div>
                  </div>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
                  <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-center hover:bg-white/15 transition-all duration-300 animate-in slide-in-from-bottom-4 duration-1000 delay-200">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                      <Users className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2">لقاءات ذكية</h3>
                    <p className="text-cyan-200 text-xs sm:text-sm">تقابل ٤ أشخاص مختلفين بناءً على تحليل شخصيتك</p>
                  </div>
                  
                  <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-center hover:bg-white/15 transition-all duration-300 animate-in slide-in-from-bottom-4 duration-1000 delay-400">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                      <Brain className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2">تحليل متقدم</h3>
                    <p className="text-cyan-200 text-xs sm:text-sm">ذكاء اصطناعي يحلل شخصيتك ويجد أفضل التوافقات</p>
                  </div>
                  
                  <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-center hover:bg-white/15 transition-all duration-300 sm:col-span-2 lg:col-span-1 animate-in slide-in-from-bottom-4 duration-1000 delay-600">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                      <Target className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2">نتائج دقيقة</h3>
                    <p className="text-cyan-200 text-xs sm:text-sm">احصل على تقييم دقيق لدرجة التوافق مع كل شخص</p>
                  </div>
                </div>

                {/* Registration Options */}
                <div className="max-w-2xl mx-auto px-4 animate-in slide-in-from-bottom-4 duration-1000 delay-800">
                  <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl sm:rounded-2xl p-6 sm:p-8">
                    <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-6 sm:mb-8">انضم إلى الرحلة</h2>
                    
                    {/* New Player Option */}
                    <div className="mb-6 sm:mb-8">
                      <div className="flex items-center gap-3 mb-3 sm:mb-4">
                        <div className="w-2 h-2 sm:w-3 sm:h-3 bg-cyan-400 rounded-full"></div>
                        <h3 className="text-base sm:text-lg font-semibold text-white">لاعب جديد</h3>
                      </div>
                      <p className="text-cyan-200 text-xs sm:text-sm mb-3 sm:mb-4">احصل على رقم مخصص وابدأ رحلة التوافق</p>
                      <Button
                        onClick={async () => {
                          setLoading(true)
                          try {
                            const res = await fetch("/api/token-handler", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "create" }),
                            })
                            const data = await res.json()
                            if (data.secure_token) {
                              setAssignedNumber(data.assigned_number)
                              // Redirect to the same page with the token
                              window.location.href = `/welcome?token=${data.secure_token}`
                            } else {
                              alert("❌ فشل في الحصول على رقم")
                            }
                          } catch (err) {
                            console.error("Error creating token:", err)
                            alert("❌ فشل في الحصول على رقم")
                          } finally {
                            setLoading(false)
                          }
                        }}
                        disabled={loading}
                        className="w-full spring-btn bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-700 hover:to-blue-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105 text-base sm:text-lg py-3 sm:py-4"
                      >
                        {loading ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            جاري التخصيص...
                          </div>
                        ) : (
                          "Pay to join"
                        )}
                      </Button>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
                      <div className="flex-1 h-px bg-white/20"></div>
                      <span className="text-white/60 text-xs sm:text-sm">أو</span>
                      <div className="flex-1 h-px bg-white/20"></div>
                    </div>

                    {/* Returning Player Option */}
                    <div>
                      <div className="flex items-center gap-3 mb-3 sm:mb-4">
                        <div className="w-2 h-2 sm:w-3 sm:h-3 bg-purple-400 rounded-full"></div>
                        <h3 className="text-base sm:text-lg font-semibold text-white">لاعب عائد</h3>
                      </div>
                      <p className="text-cyan-200 text-xs sm:text-sm mb-3 sm:mb-4">أدخل رمزك للعودة إلى رحلتك</p>
                      <div className="space-y-3 sm:space-y-4">
                        <input
                          type="text"
                          placeholder="أدخل رمز الدخول..."
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white/10 border border-white/20 rounded-lg sm:rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400 transition-all duration-300 text-sm sm:text-base"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              const token = e.currentTarget.value.trim()
                              if (token) {
                                window.location.href = `/welcome?token=${token}`
                              }
                            }
                          }}
                        />
                        <Button
                          onClick={() => {
                            const tokenInput = document.querySelector('input[type="text"]') as HTMLInputElement
                            const token = tokenInput?.value.trim()
                            if (token) {
                              window.location.href = `/welcome?token=${token}`
                            } else {
                              alert("يرجى إدخال رمز صحيح")
                            }
                          }}
                          className="w-full spring-btn bg-gradient-to-r from-purple-600 to-pink-700 hover:from-purple-700 hover:to-pink-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105 text-base sm:text-lg py-3 sm:py-4"
                        >
                          العودة للرحلة
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Info */}
                <div className="text-center mt-8 sm:mt-12 px-4 animate-in slide-in-from-bottom-4 duration-1000 delay-1000">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 text-cyan-200 text-xs sm:text-sm">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>آمن ومحمي</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>سريع وسهل</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Heart className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>نتائج مضمونة</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Animation Trigger */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              setTimeout(() => {
                document.dispatchEvent(new CustomEvent('showRegistrationContent'));
              }, 3000);
            `,
          }}
        />
      </div>
    );
  }

  if (phase === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-400 mx-auto"></div>
          <p className="text-slate-300 text-xl font-medium" dir="rtl">جارٍ التحميل...</p>
        </div>
      </div>
    )
  }
  
if (!isResolving && (phase === "round_1" || phase === "round_2" || phase === "round_3" || phase === "round_4" || phase === "group_phase") && step === 0) {
  return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center space-y-4 max-w-md mx-auto p-8">
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 backdrop-blur-sm">
            <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="font-bold text-2xl text-red-200 mb-2">التسجيل مغلق</h2>
            <p className="text-red-300 text-sm">المنظّم بدأ التوافق أو أغلق التسجيل.</p>
          </div>
        </div>
      </div>
    )
  }

  // Emergency pause overlay
  if (emergencyPaused) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-900 via-red-800 to-red-900 animate-in fade-in duration-500">
        <div className="text-center space-y-8 max-w-md mx-auto p-8">
          <div className="bg-red-500/20 border-2 border-red-400/40 rounded-3xl p-10 backdrop-blur-xl shadow-2xl transform transition-all duration-500 hover:scale-105">
            {/* Animated warning icon */}
            <div className="relative mb-8">
              <AlertTriangle className="w-20 h-20 text-red-400 mx-auto animate-pulse" />
              {/* Ripple effects */}
              <div className="absolute inset-0 w-20 h-20 mx-auto rounded-full bg-red-400/20 animate-ping"></div>
              <div className="absolute inset-0 w-20 h-20 mx-auto rounded-full bg-red-400/10 animate-ping" style={{ animationDelay: '0.5s' }}></div>
            </div>
            
            <h2 className="font-bold text-4xl text-red-200 mb-6 animate-in slide-in-from-bottom-4 duration-700">النشاط متوقف مؤقتاً</h2>
            <p className="text-red-300 text-xl leading-relaxed animate-in slide-in-from-bottom-4 duration-700 delay-200">
              المنظّم أوقف النشاط مؤقتاً. يرجى الانتظار...
            </p>
            
            {/* Animated dots */}
            <div className="flex justify-center gap-2 mt-8">
              <div className="w-3 h-3 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-3 h-3 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-3 h-3 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
            
            {announcement?.message && (
              <div className="mt-8 p-6 rounded-2xl border-2 border-red-400/30 bg-red-500/10 backdrop-blur-sm animate-in slide-in-from-bottom-4 duration-700 delay-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
                  <p className="text-red-200 font-medium text-sm">رسالة من المنظّم:</p>
                </div>
                <p className="text-red-200 font-semibold text-lg leading-relaxed">{announcement.message}</p>
              </div>
            )}
          </div>
        </div>
    </div>
  )
}
  
  return (
    <div
      className={`min-h-screen px-4 py-10 flex items-center justify-center relative overflow-hidden ${
        dark
          ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white"
          : "bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-900"
      }`}
      dir="rtl"
    >
      {/* Announcement Banner */}
      {announcement?.message && (
        <div className="fixed top-0 left-0 right-0 z-50 p-4 animate-in slide-in-from-top-4 duration-500">
          <div className={`max-w-4xl mx-auto rounded-2xl border-2 p-6 backdrop-blur-xl shadow-2xl transform transition-all duration-500 hover:scale-[1.02] ${
            announcement.type === "warning" 
              ? "bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-yellow-400/40 text-yellow-100 shadow-yellow-500/20"
              : announcement.type === "error"
              ? "bg-gradient-to-r from-red-500/20 to-pink-500/20 border-red-400/40 text-red-100 shadow-red-500/20"
              : announcement.type === "success"
              ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-400/40 text-green-100 shadow-green-500/20"
              : "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-400/40 text-blue-100 shadow-blue-500/20"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Animated icon */}
                <div className={`relative w-8 h-8 rounded-full flex items-center justify-center ${
                  announcement.type === "warning" ? "bg-yellow-400/20" :
                  announcement.type === "error" ? "bg-red-400/20" :
                  announcement.type === "success" ? "bg-green-400/20" :
                  "bg-blue-400/20"
                }`}>
                  <div className={`w-3 h-3 rounded-full animate-pulse ${
                    announcement.type === "warning" ? "bg-yellow-400" :
                    announcement.type === "error" ? "bg-red-400" :
                    announcement.type === "success" ? "bg-green-400" :
                    "bg-blue-400"
                  }`}></div>
                  {/* Ripple effect */}
                  <div className={`absolute inset-0 rounded-full animate-ping ${
                    announcement.type === "warning" ? "bg-yellow-400/30" :
                    announcement.type === "error" ? "bg-red-400/30" :
                    announcement.type === "success" ? "bg-green-400/30" :
                    "bg-blue-400/30"
                  }`}></div>
                </div>
                
                {/* Message content */}
                <div className="flex-1">
                  <p className="font-semibold text-lg leading-relaxed">{announcement.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-1 h-1 rounded-full ${
                      announcement.type === "warning" ? "bg-yellow-400" :
                      announcement.type === "error" ? "bg-red-400" :
                      announcement.type === "success" ? "bg-green-400" :
                      "bg-blue-400"
                    }`}></div>
                    <p className="text-xs opacity-70 font-medium">
                      {new Date(announcement.time).toLocaleTimeString('ar-SA', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Close button with animation */}
              <button
                onClick={() => setAnnouncement(null)}
                className={`p-2 rounded-full transition-all duration-300 hover:scale-110 hover:bg-white/10 ${
                  announcement.type === "warning" ? "text-yellow-300 hover:text-yellow-200" :
                  announcement.type === "error" ? "text-red-300 hover:text-red-200" :
                  announcement.type === "success" ? "text-green-300 hover:text-green-200" :
                  "text-blue-300 hover:text-blue-200"
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Progress bar */}
            <div className="mt-4 h-1 bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-100 ${
                announcement.type === "warning" ? "bg-yellow-400" :
                announcement.type === "error" ? "bg-red-400" :
                announcement.type === "success" ? "bg-green-400" :
                "bg-blue-400"
              }`} style={{
                width: `${announcementProgress}%`
              }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={`absolute -top-40 -right-40 w-80 h-80 rounded-full blur-3xl animate-pulse ${
          dark ? "bg-slate-500/10" : "bg-blue-400/20"
        }`}></div>
        <div className={`absolute -bottom-40 -left-40 w-80 h-80 rounded-full blur-3xl animate-pulse delay-1000 ${
          dark ? "bg-slate-400/10" : "bg-purple-400/15"
        }`}></div>
        <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl animate-pulse delay-500 ${
          dark ? "bg-gradient-to-r from-slate-500/5 to-slate-400/5" : "bg-gradient-to-r from-blue-400/10 to-purple-400/10"
        }`}></div>
        <div className="pointer-events-none absolute inset-0 z-0">
          {/* Floating particles */}
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className={`absolute rounded-full opacity-40 animate-float-particle${i % 2 === 0 ? '' : '-reverse'} ${
                dark
                  ? i % 3 === 0
                    ? 'bg-cyan-400/30'
                    : 'bg-slate-400/20'
                  : i % 3 === 0
                    ? 'bg-blue-400/30'
                    : 'bg-purple-400/20'
              }`}
              style={{
                width: `${32 + (i % 3) * 24}px`,
                height: `${32 + (i % 4) * 20}px`,
                top: `${10 + (i * 10) % 70}%`,
                left: `${5 + (i * 13) % 85}%`,
                animationDelay: `${i * 0.7}s`,
                zIndex: 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='${dark ? '%236B7280' : '%233B82F6'}' fill-opacity='${dark ? '0.1' : '0.15'}'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }}></div>

      {/* زر الوضع المظلم */}
      <div className="absolute top-4 right-4 z-50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDark(!dark)}
          className={`group border backdrop-blur-sm rounded-xl p-3 flex items-center justify-center transition-all duration-300 hover:scale-110 ${
            dark 
              ? "border-slate-500/30 bg-slate-500/10 text-slate-200 hover:bg-slate-500/20" 
              : "border-gray-300/50 bg-black/10 text-gray-700 hover:bg-black/20"
          }`}
        >
          {dark ? (
            <SunIcon size={18} className="transition-transform group-hover:-rotate-12 group-hover:scale-105" />
          ) : (
            <MoonIcon size={18} className="transition-transform group-hover:rotate-12 group-hover:scale-105" />
          )}
        </Button>
      </div>

      <div className="w-full max-w-md space-y-10 text-center animate-fade-in relative z-10">
        {step >= 0 && (
          <SleekTimeline 
            currentStep={(() => {
              // Timeline labels in RTL order: ["المجموعات", "الجولة ٤", "الجولة ٣", "الجولة ٢", "الجولة ١", "تحليل", "النموذج"]
              // RTL indices: 6=Groups, 5=Round4, 4=Round3, 3=Round2, 2=Round1, 1=Analysis, 0=Form
              let timelineStep = 0;
              
              if (phase === "registration") timelineStep = 0; // Form (rightmost)
              else if (phase === "form") timelineStep = 0; // Form (rightmost)
              else if (phase === "waiting") timelineStep = 1; // Analysis
              else if (phase === "round_1") timelineStep = 2; // Round 1
              else if (phase === "waiting_2") timelineStep = 2; // Round 1 (waiting for round 2)
              else if (phase === "round_2") timelineStep = 3; // Round 2
              else if (phase === "waiting_3") timelineStep = 3; // Round 2 (waiting for round 3)
              else if (phase === "round_3") timelineStep = 4; // Round 3
              else if (phase === "waiting_4") timelineStep = 4; // Round 3 (waiting for round 4)
              else if (phase === "round_4") timelineStep = 5; // Round 4
              else if (phase === "group_phase") timelineStep = 6; // Groups (leftmost)
              else {
                // Fallback to step-based calculation if phase is not set
                if (step === 0) timelineStep = 0; // Welcome screen -> Form
                else if (step === 1) timelineStep = 0; // Number entry -> Form
                else if (step === 2) timelineStep = 0; // Form -> Form
                else if (step === 3) timelineStep = 1; // Analysis -> Analysis
                else if (step === 4) timelineStep = 2 + (currentRound - 1); // Round X -> Round X
                else if (step === 5) timelineStep = 2 + currentRound; // Waiting -> Next Round
                else if (step === 6) timelineStep = 4; // Round 2 -> Round 2
                else if (step === 7) timelineStep = 6; // Group phase -> Groups
                else timelineStep = 0;
              }
              
              console.log(`Timeline Debug: phase=${phase}, currentRound=${currentRound}, step=${step}, timelineStep=${timelineStep}`);
              return timelineStep;
            })()} 
            totalSteps={7} 
            dark={dark} 
            formCompleted={step >= 3}
            currentRound={currentRound}
            totalRounds={totalRounds}
          />
        )}

        {/* Welcome Landing Page */}
        {step === -1 && (
          <section className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
            <div className="relative">
              <div className={`absolute inset-0 rounded-2xl blur-xl opacity-20 animate-pulse ${
                dark ? "bg-gradient-to-r from-cyan-600 to-blue-700" : "bg-gradient-to-r from-cyan-400 to-blue-500"
              }`}></div>
              <div className={`relative backdrop-blur-xl border rounded-2xl p-8 shadow-2xl transition-all duration-500 hover:shadow-2xl hover:scale-[1.02] hover:border-opacity-50 ${
                dark ? "bg-white/10 border-white/20 hover:bg-white/15" : "bg-white/80 border-gray-200/50 shadow-xl hover:bg-white/90"
              }`}>
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <div className={`w-20 h-20 rounded-2xl border-2 shadow-2xl flex items-center justify-center transform transition-all duration-500 hover:scale-110 ${
                      dark 
                        ? "bg-gradient-to-br from-cyan-700 via-blue-600 to-cyan-800 border-cyan-400/50 shadow-cyan-500/20" 
                        : "bg-gradient-to-br from-cyan-100 via-blue-100 to-cyan-200 border-cyan-400/50 shadow-cyan-500/20"
                    }`}>
                      <span className={`text-2xl font-bold tracking-wider ${
                        dark ? "text-white" : "text-gray-800"
                      }`}>
                        {assignedNumber ?? "؟"}
                      </span>
                    </div>
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-400 rounded-full border-2 border-white animate-pulse"></div>
                  </div>
                </div>
                
                <div className="text-center space-y-4">
                  <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight bg-clip-text text-transparent mb-4 ${
                    dark ? "bg-gradient-to-r from-cyan-300 to-blue-400" : "bg-gradient-to-r from-cyan-600 to-blue-700"
                  }`}>
                    نظام التوافق الذكي
                  </h1>
                  
                  <div className={`min-h-[6rem] text-right leading-relaxed ${
                    dark ? "text-slate-200" : "text-gray-700"
                  }`}>
                    {welcomeText.split('\n').map((line, index) => (
                      <p key={index} className="mb-2">
                        {line}
                        {index === welcomeText.split('\n').length - 1 && welcomeTyping && (
                          <span className="animate-pulse">|</span>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            {!welcomeTyping && (
              <div className="flex justify-center">
                <FancyNextButton onClick={() => setStep(0)} label="ابدأ الرحلة" />
              </div>
            )}
          </section>
        )}

        {/* خطوة 0 */}
        {step === 0 && (
          <section className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
            <div className="relative">
              <div className={`absolute inset-0 rounded-2xl blur-xl opacity-20 animate-pulse ${
                dark ? "bg-gradient-to-r from-slate-600 to-slate-700" : "bg-gradient-to-r from-gray-400 to-gray-500"
              }`}></div>
              <div className={`relative backdrop-blur-xl border rounded-2xl p-8 shadow-2xl transition-all duration-500 hover:shadow-2xl hover:scale-[1.02] hover:border-opacity-50 ${
                dark ? "bg-white/10 border-white/20 hover:bg-white/15" : "bg-white/80 border-gray-200/50 shadow-xl hover:bg-white/90"
              }`}>
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <Brain className={`w-16 h-16 animate-pulse ${
                      dark ? "text-slate-400" : "text-gray-600"
                    }`} />
                    <Sparkles className={`w-6 h-6 absolute -top-2 -right-2 animate-bounce ${
                      dark ? "text-slate-300" : "text-gray-500"
                    }`} />
                  </div>
                </div>
                <h1 className={`text-3xl sm:text-4xl font-bold tracking-tight bg-clip-text text-transparent mb-4 ${
                  dark ? "bg-gradient-to-r from-slate-300 to-slate-400" : "bg-gradient-to-r from-gray-700 to-gray-800"
                }`}>
                  نظام التوافق الذكي
                </h1>
                <p className={`text-sm sm:text-base leading-relaxed ${
                  dark ? "text-slate-300" : "text-gray-600"
                }`}>
              بتقابل ٤ أشخاص. بعد كل حوار، قرر إذا كان
                  <span className={`font-semibold ${
                    dark ? "text-slate-200" : "text-gray-800"
                  }`}> توأم روحك </span>
              أو
                  <span className="font-semibold text-red-500"> خصمك اللدود</span>.
            </p>
              </div>
            </div>
            <div className="flex justify-center">
              <FancyNextButton onClick={next} label="ابدأ الرحلة" />
            </div>
          </section>
        )}

        {/* Too Late Message */}
        {step === -2 && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 backdrop-blur-xl">
              <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-red-200">التوافق بدأ بالفعل</h2>
              <p className="text-red-300 text-sm">ما لحقت تعبي النموذج. تابع المنظّم وانتظر الجولة الجاية.</p>
            </div>
  </section>
)}

        {/* خطوة 1 */}
        {step === 1 && !token && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
            <div className={`backdrop-blur-xl border rounded-2xl p-8 shadow-2xl ${
              dark ? "bg-white/10 border-white/20" : "bg-white/80 border-gray-200/50 shadow-xl"
            }`}>
              <div className="flex justify-center mb-4">
                <Cpu className={`w-12 h-12 ${
                  dark ? "text-slate-400" : "text-blue-600"
                }`} />
              </div>
              <h2 className={`text-xl font-semibold mb-2 ${
                dark ? "text-slate-200" : "text-gray-800"
              }`}>تسجيل المشاركة</h2>
              <p className={`text-sm mb-6 ${
                dark ? "text-slate-300" : "text-gray-600"
              }`}>اضغط على الزر أدناه للحصول على رقم مخصص تلقائياً</p>
              
              <div className="flex justify-center">
                <Button
                  onClick={async () => {
                    setLoading(true)
                    try {
                      const res = await fetch("/api/token-handler", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "create" }),
                      })
                      const data = await res.json()
                      if (data.secure_token) {
                        setAssignedNumber(data.assigned_number)
                        // Redirect to the same page with the token
                        window.location.href = `/welcome?token=${data.secure_token}`
                      } else {
                        alert("❌ فشل في الحصول على رقم")
                      }
                    } catch (err) {
                      console.error("Error creating token:", err)
                      alert("❌ فشل في الحصول على رقم")
                    } finally {
                      setLoading(false)
                    }
                  }}
                  disabled={loading}
                  className="spring-btn bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105"
                >
                  {loading ? "جاري التخصيص..." : "احصل على رقم مخصص"}
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* خطوة 2 */}
        {step === 2 && (
          <section className="space-y-6 text-right animate-in slide-in-from-bottom-4 duration-700">
            <div className={`backdrop-blur-xl border rounded-2xl p-8 shadow-2xl transition-all duration-500 hover:shadow-2xl hover:scale-[1.02] hover:border-opacity-50 ${
              dark ? "bg-white/10 border-white/20 hover:bg-white/15" : "bg-white/80 border-gray-200/50 shadow-xl hover:bg-white/90"
            }`}>
              <div className="flex flex-col items-center gap-4 mb-6">
                <div className="relative">
                  <div className={`relative w-24 h-24 rounded-2xl border-2 shadow-2xl flex items-center justify-center transform transition-all duration-500 hover:scale-110 ${
                    dark 
                      ? "bg-gradient-to-br from-slate-700 via-slate-600 to-slate-800 border-slate-400/50 shadow-slate-500/20" 
                      : "bg-gradient-to-br from-gray-100 via-white to-gray-200 border-gray-400/50 shadow-gray-500/20"
                  }`}>
                    {/* Animated background glow */}
                    <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 animate-pulse`}></div>
                    
                    {/* Number display */}
                    <span className={`relative z-10 text-3xl font-bold tracking-wider ${
                      dark ? "text-white" : "text-gray-800"
                    }`}>
                      {assignedNumber ?? "؟"}
                    </span>
                    
                    {/* Corner accent */}
                    <div className={`absolute -top-1 -right-1 w-6 h-6 rounded-full border-2 ${
                      dark ? "bg-green-400 border-white" : "bg-green-500 border-white"
                    } animate-pulse`}></div>
                    
                    {/* Subtle corner lines */}
                    <div className={`absolute top-2 left-2 w-2 h-2 border-l-2 border-t-2 rounded-tl ${
                      dark ? "border-cyan-400/60" : "border-blue-500/60"
                    }`}></div>
                    <div className={`absolute bottom-2 right-2 w-2 h-2 border-r-2 border-b-2 rounded-br ${
                      dark ? "border-cyan-400/60" : "border-blue-500/60"
                    }`}></div>
            </div>

                  {/* Floating particles around the icon */}
                  <div className="absolute -top-2 -left-2 w-2 h-2 bg-cyan-400/60 rounded-full animate-ping" style={{ animationDelay: '0s' }}></div>
                  <div className="absolute -top-1 -right-3 w-1.5 h-1.5 bg-blue-400/60 rounded-full animate-ping" style={{ animationDelay: '0.5s' }}></div>
                  <div className="absolute -bottom-1 -left-3 w-1 h-1 bg-purple-400/60 rounded-full animate-ping" style={{ animationDelay: '1s' }}></div>
                </div>
                <h2 className={`text-xl font-bold text-center ${
                  dark ? "text-slate-200" : "text-gray-800"
                }`}>تحليل الشخصية الذكي</h2>
              </div>

              <form className="space-y-6 max-w-md mx-auto">
                <div className="space-y-3">
                  <label className={`block text-sm font-medium ${
                    dark ? "text-slate-200" : "text-gray-700"
                  }`}>وش تسوي بوقتك الفاضي؟</label>
                <input
                  type="text"
                  value={freeTime}
                  onChange={(e) => setFreeTime(e.target.value)}
                    className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 ${
                      dark 
                        ? "border-slate-400/30 bg-white/10 text-white placeholder-slate-300/50 focus:ring-slate-400/30 focus:border-slate-400"
                        : "border-blue-400/30 bg-white/90 text-gray-800 placeholder-gray-500/50 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm"
                    }`}
                    placeholder="اكتب إجابتك هنا..."
                />
              </div>

                <div className="space-y-3">
                  <label className={`block text-sm font-medium ${
                    dark ? "text-slate-200" : "text-gray-700"
                  }`}>كيف يوصفونك أصحابك؟</label>
                <input
                  type="text"
                  value={friendDesc}
                  onChange={(e) => setFriendDesc(e.target.value)}
                    className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 ${
                      dark 
                        ? "border-slate-400/30 bg-white/10 text-white placeholder-slate-300/50 focus:ring-slate-400/30 focus:border-slate-400"
                        : "border-blue-400/30 bg-white/90 text-gray-800 placeholder-gray-500/50 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm"
                    }`}
                    placeholder="اكتب إجابتك هنا..."
                />
              </div>

                <div className="space-y-3">
                  <label className={`block text-sm font-medium ${
                    dark ? "text-slate-200" : "text-gray-700"
                  }`}>تميل أكثر لـ:</label>
                <select
                  value={preference}
                  onChange={(e) => setPreference(e.target.value)}
                    className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 ${
                      dark 
                        ? "border-slate-400/30 bg-white/10 text-white focus:ring-slate-400/30 focus:border-slate-400"
                        : "border-blue-400/30 bg-white/90 text-gray-800 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm"
                    }`}
                  >
                    <option value="" className={dark ? "bg-slate-800" : "bg-white"}>اختر وحدة</option>
                    <option value="alone" className={dark ? "bg-slate-800" : "bg-white"}>جلسة هادئة بين شخصين</option>
                    <option value="group" className={dark ? "bg-slate-800" : "bg-white"}>نشاط ممتع مع مجموعة</option>
                </select>
              </div>

                <div className="space-y-3">
                  <label className={`block text-sm font-medium ${
                    dark ? "text-slate-200" : "text-gray-700"
                  }`}>وش يميزك عن غيرك؟</label>
                <input
                  type="text"
                  value={uniqueTrait}
                  onChange={(e) => setUniqueTrait(e.target.value)}
                    className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 ${
                      dark 
                        ? "border-slate-400/30 bg-white/10 text-white placeholder-slate-300/50 focus:ring-slate-400/30 focus:border-slate-400"
                        : "border-blue-400/30 bg-white/90 text-gray-800 placeholder-gray-500/50 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm"
                    }`}
                    placeholder="اكتب إجابتك هنا..."
                />
              </div>
            </form>
            </div>

            <div className="flex justify-center gap-3">
              <FancyPreviousButton onClick={previous} label="رجوع" />
              <FancyNextButton onClick={handleSubmit} label={loading ? "جاري التحليل..." : "ارسال وبدء"} />
            </div>
          </section>
        )}

        {/* خطوة 3 */}
        {step === 3 && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
            <div className={`relative backdrop-blur-xl border rounded-2xl p-8 shadow-2xl ${
              dark ? "bg-white/10 border-white/20" : "bg-black/10 border-gray-300/30"
            }`}>
              {/* Player Avatar - Positioned outside as part of the box design */}
              <div className="absolute -top-3 -right-3 z-10">
                <div className="relative">
                  <Avatar className={`w-12 h-12 border-2 shadow-lg ${
                    dark ? "border-slate-400/50 bg-slate-700" : "border-gray-400/50 bg-gray-200"
                  }`}>
                    <AvatarFallback className={`text-sm font-semibold text-white ${
                      dark ? "bg-gradient-to-r from-slate-500 to-slate-600" : "bg-gradient-to-r from-gray-500 to-gray-600"
                    }`}>
                      {assignedNumber ?? "؟"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border border-white animate-pulse"></div>
                </div>
              </div>

              <div className="flex justify-center mb-4">
                <Brain className={`w-12 h-12 animate-pulse ${
                  dark ? "text-slate-400" : "text-gray-600"
                }`} />
              </div>
              <h3 className={`text-lg font-semibold text-center mb-6 ${
                dark ? "text-slate-200" : "text-gray-800"
              }`}>تحليل شخصيتك</h3>
            <div
              dir="rtl"
                className={`mx-auto max-w-md rounded-xl border-2 backdrop-blur-sm p-6 shadow-lg ${
                  dark ? "border-slate-400/30 bg-white/10" : "border-gray-400/30 bg-white/80"
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Zap className={`w-5 h-5 ${
                    dark ? "text-slate-300" : "text-gray-500"
                  }`} />
                  <h4 className={`text-sm font-medium ${
                    dark ? "text-slate-200" : "text-gray-700"
                  }`}>الذكاء الاصطناعي يحلل...</h4>
                </div>
                <div className={`text-sm text-right leading-relaxed italic min-h-[4rem] ${
                  dark ? "text-slate-300" : "text-gray-600"
                }`}>
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className={`animate-spin rounded-full h-4 w-4 border-b-2 ${
                        dark ? "border-slate-400" : "border-gray-400"
                      }`}></div>
                      جاري تحليل شخصيتك...
                    </div>
                  ) : (
                    <div>
                      {typewriterText}
                      {isTyping && <span className="animate-pulse">|</span>}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-8 flex flex-col items-center justify-center">
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-lg shadow-lg border-2 ${
                  dark ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-400/30 text-blue-200' : 'bg-gradient-to-r from-blue-200/50 to-cyan-200/50 border-blue-400/30 text-blue-700'
                }`}> 
                  <Clock className="w-6 h-6" />
                  يرجى الانتظار حتى ينقلك المنظّم للمرحلة التالية
                </div>
              </div>
            </div>

            {/* Users wait for host to move them to next phase */}
          </section>
        )}

        {step === 4 && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
            <div className={`relative backdrop-blur-xl border rounded-2xl p-8 shadow-2xl ${
              dark ? "bg-white/10 border-white/20" : "bg-black/10 border-gray-300/30"
            }`}>
              {/* Player Avatar - Positioned outside as part of the box design */}
              <div className="absolute -top-3 -right-3 z-10">
                <div className="relative">
                  <Avatar className={`w-12 h-12 border-2 shadow-lg ${
                    dark ? "border-slate-400/50 bg-slate-700" : "border-gray-400/50 bg-gray-200"
                  }`}>
                    <AvatarFallback className={`text-sm font-semibold text-white ${
                      dark ? "bg-gradient-to-r from-slate-500 to-slate-600" : "bg-gradient-to-r from-gray-500 to-gray-600"
                    }`}>
                      {assignedNumber ?? "؟"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border border-white animate-pulse"></div>
                </div>
              </div>

              <div className="flex justify-center mb-4">
                <Target className={`w-12 h-12 animate-bounce ${
                  dark ? "text-slate-400" : "text-gray-600"
                }`} />
              </div>
              
              {!conversationStarted ? (
                <>
                  <h3 className={`text-xl font-bold text-center mb-4 ${
                    dark ? "text-slate-200" : "text-gray-800"
                  }`}>
                    توأم روحك هو رقم {matchResult}
                  </h3>
                  
                  <div className={`text-center mb-4 p-3 rounded-xl border ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <p className={`text-lg font-semibold ${
                      dark ? "text-slate-200" : "text-gray-700"
                    }`}>
                      {tableNumber ? `اذهب إلى الطاولة رقم ${tableNumber}` : "سيتم إخبارك بالطاولة قريباً"}
              </p>
            </div>

                  <div className={`rounded-xl p-4 border mb-6 ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-label="التالي"
                        className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                        onClick={() => setPromptIndex((i) => (i + 1) % prompts.length)}
                        disabled={prompts.length <= 1}
                      >
                        <ChevronLeftIcon className="w-5 h-5" />
                      </button>
                      <p className={`flex-1 text-center text-base font-medium ${dark ? "text-slate-200" : "text-blue-700"}`}>{prompts[promptIndex]}</p>
                      <button
                        type="button"
                        aria-label="السابق"
                        className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                        onClick={() => setPromptIndex((i) => (i - 1 + prompts.length) % prompts.length)}
                        disabled={prompts.length <= 1}
                      >
                        <ChevronRightIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

            <div className="flex justify-center gap-3">
                    <FancyPreviousButton onClick={skipConversation} label="تخطي الحوار" />
                    <FancyNextButton onClick={startConversation} label="ابدأ الحوار" />
                  </div>
                </>
              ) : (
                <>
                  <h3 className={`text-xl font-bold text-center mb-4 ${
                    dark ? "text-slate-200" : "text-gray-800"
                  }`}>
                    حوار مع رقم {matchResult}
                  </h3>
                  
                  <div className={`text-center mb-4 p-3 rounded-xl border ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <p className={`text-lg font-semibold ${
                      dark ? "text-slate-200" : "text-gray-700"
                    }`}>
                      {tableNumber ? `الطاولة رقم ${tableNumber}` : "سيتم إخبارك بالطاولة قريباً"}
                    </p>
                  </div>

                  <div className={`rounded-xl p-4 border mb-6 ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-label="التالي"
                        className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                        onClick={() => setPromptIndex((i) => (i + 1) % prompts.length)}
                        disabled={prompts.length <= 1}
                      >
                        <ChevronLeftIcon className="w-5 h-5" />
                      </button>
                      <p className={`flex-1 text-center text-base font-medium ${dark ? "text-slate-200" : "text-blue-700"}`}>{prompts[promptIndex]}</p>
                      <button
                        type="button"
                        aria-label="السابق"
                        className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                        onClick={() => setPromptIndex((i) => (i - 1 + prompts.length) % prompts.length)}
                        disabled={prompts.length <= 1}
                      >
                        <ChevronRightIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className={`text-center mb-6 p-4 rounded-xl border ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Clock className={`w-5 h-5 ${
                        dark ? "text-slate-300" : "text-gray-500"
                      }`} />
                      <span className={`text-sm font-medium ${
                        dark ? "text-slate-200" : "text-gray-700"
                      }`}>الوقت المتبقي:</span>
                    </div>
                    <p className={`text-2xl font-bold ${
                      dark ? "text-slate-200" : "text-gray-800"
                    }`}>
                      {formatTime(conversationTimer)}
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <FancyNextButton onClick={skipConversation} label="إنهاء الحوار" />
                  </div>
                </>
              )}
</div>
          </section>
        )}

        {step === 5 && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
            <div className={`relative backdrop-blur-xl border rounded-2xl p-8 shadow-2xl ${
              dark ? "bg-white/10 border-white/20" : "bg-black/10 border-gray-300/30"
            }`}>
              {/* Player Avatar - Positioned outside as part of the box design */}
              <div className="absolute -top-3 -right-3 z-10">
                <div className="relative">
                  <Avatar className={`w-12 h-12 border-2 shadow-lg ${
                    dark ? "border-slate-400/50 bg-slate-700" : "border-gray-400/50 bg-gray-200"
                  }`}>
                    <AvatarFallback className={`text-sm font-semibold text-white ${
                      dark ? "bg-gradient-to-r from-slate-500 to-slate-600" : "bg-gradient-to-r from-gray-500 to-gray-600"
                    }`}>
                      {assignedNumber ?? "؟"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border border-white animate-pulse"></div>
                </div>
              </div>

              <div className="flex justify-center mb-4">
                <Users className={`w-12 h-12 animate-pulse ${
                  dark ? "text-slate-400" : "text-gray-600"
                }`} />
              </div>
              <h3 className={`text-lg font-semibold text-center mb-4 ${dark ? "text-slate-200" : "text-gray-800"}`}>
                بانتظار المنظّم لبدء الجولة الثانية...
    </h3>
              <p className={`text-center text-sm italic mb-6 ${
                dark ? "text-slate-300" : "text-gray-600"
              }`}>
      لا تسكّر الصفحة! بنخبرك إذا بدأ التوافق.
    </p>

    <div
      dir="rtl"
                className={`mx-auto max-w-md rounded-xl border-2 backdrop-blur-sm p-6 shadow-lg ${
                  dark ? "border-slate-400/30 bg-white/10" : "border-gray-400/30 bg-white/80"
                }`}>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-label="التالي"
                    className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                    onClick={() => setPromptIndex((i) => (i + 1) % prompts.length)}
                    disabled={prompts.length <= 1}
                  >
                    <ChevronLeftIcon className="w-5 h-5" />
                  </button>
                  <p className={`flex-1 text-center text-base font-medium ${dark ? "text-slate-200" : "text-blue-700"}`}>{prompts[promptIndex]}</p>
                  <button
                    type="button"
                    aria-label="السابق"
                    className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                    onClick={() => setPromptIndex((i) => (i - 1 + prompts.length) % prompts.length)}
                    disabled={prompts.length <= 1}
                  >
                    <ChevronRightIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {step === 6 && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
            <div className={`relative backdrop-blur-xl border rounded-2xl p-8 shadow-2xl ${
              dark ? "bg-white/10 border-white/20" : "bg-black/10 border-gray-300/30"
            }`}>
              {/* Player Avatar - Positioned outside as part of the box design */}
              <div className="absolute -top-3 -right-3 z-10">
                <div className="relative">
                  <Avatar className={`w-12 h-12 border-2 shadow-lg ${
                    dark ? "border-slate-400/50 bg-slate-700" : "border-gray-400/50 bg-gray-200"
                  }`}>
                    <AvatarFallback className={`text-sm font-semibold text-white ${
                      dark ? "bg-gradient-to-r from-slate-500 to-slate-600" : "bg-gradient-to-r from-gray-500 to-gray-600"
                    }`}>
                      {assignedNumber ?? "؟"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border border-white animate-pulse"></div>
                </div>
              </div>

              <div className="flex justify-center mb-4">
                <Target className={`w-12 h-12 animate-bounce ${
                  dark ? "text-slate-400" : "text-gray-600"
                }`} />
              </div>
              
              {!conversationStarted ? (
                <>
                  <h3 className={`text-xl font-bold text-center mb-4 ${
                    dark ? "text-slate-200" : "text-gray-800"
                  }`}>
                    توأم روحك في الجولة {currentRound} هو رقم {matchResult}
                  </h3>
                  
                  <div className={`text-center mb-4 p-3 rounded-xl border ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <p className={`text-lg font-semibold ${
                      dark ? "text-slate-200" : "text-gray-700"
                    }`}>
                      {tableNumber ? `اذهب إلى الطاولة رقم ${tableNumber}` : "سيتم إخبارك بالطاولة قريباً"}
                    </p>
                  </div>

                  <div className={`rounded-xl p-4 border mb-6 ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-label="التالي"
                        className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                        onClick={() => setPromptIndex((i) => (i + 1) % prompts.length)}
                        disabled={prompts.length <= 1}
                      >
                        <ChevronLeftIcon className="w-5 h-5" />
                      </button>
                      <p className={`flex-1 text-center text-base font-medium ${dark ? "text-slate-200" : "text-blue-700"}`}>{prompts[promptIndex]}</p>
                      <button
                        type="button"
                        aria-label="السابق"
                        className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                        onClick={() => setPromptIndex((i) => (i - 1 + prompts.length) % prompts.length)}
                        disabled={prompts.length <= 1}
                      >
                        <ChevronRightIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-center gap-3">
                    <FancyPreviousButton onClick={skipConversation} label="تخطي الحوار" />
                    <FancyNextButton onClick={startConversation} label="ابدأ الحوار" />
                  </div>
                </>
              ) : (
                <>
                  <h3 className={`text-xl font-bold text-center mb-4 ${
                    dark ? "text-slate-200" : "text-gray-800"
                  }`}>
                    حوار مع رقم {matchResult} (الجولة {currentRound})
                  </h3>
                  
                  <div className={`text-center mb-4 p-3 rounded-xl border ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <p className={`text-lg font-semibold ${
                      dark ? "text-slate-200" : "text-gray-700"
                    }`}>
                      {tableNumber ? `الطاولة رقم ${tableNumber}` : "سيتم إخبارك بالطاولة قريباً"}
                    </p>
                  </div>

                  <div className={`rounded-xl p-4 border mb-6 ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-label="التالي"
                        className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                        onClick={() => setPromptIndex((i) => (i + 1) % prompts.length)}
                        disabled={prompts.length <= 1}
                      >
                        <ChevronLeftIcon className="w-5 h-5" />
                      </button>
                      <p className={`flex-1 text-center text-base font-medium ${dark ? "text-slate-200" : "text-blue-700"}`}>{prompts[promptIndex]}</p>
                      <button
                        type="button"
                        aria-label="السابق"
                        className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                        onClick={() => setPromptIndex((i) => (i - 1 + prompts.length) % prompts.length)}
                        disabled={prompts.length <= 1}
                      >
                        <ChevronRightIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className={`text-center mb-6 p-4 rounded-xl border ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Clock className={`w-5 h-5 ${
                        dark ? "text-slate-300" : "text-gray-500"
                      }`} />
                      <span className={`text-sm font-medium ${
                        dark ? "text-slate-200" : "text-gray-700"
                      }`}>الوقت المتبقي:</span>
                    </div>
                    <p className={`text-2xl font-bold ${
                      dark ? "text-slate-200" : "text-gray-800"
                    }`}>
                      {formatTime(conversationTimer)}
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <FancyNextButton onClick={skipConversation} label="إنهاء الحوار" />
                  </div>
                </>
              )}
    </div>
  </section>
)}

        {step === 7 && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
            <div className={`relative backdrop-blur-xl border rounded-2xl p-8 shadow-2xl ${
              dark ? "bg-white/10 border-white/20" : "bg-black/10 border-gray-300/30"
            }`}>
              {/* Player Avatar - Positioned outside as part of the box design */}
              <div className="absolute -top-3 -right-3 z-10">
                <div className="relative">
                  <Avatar className={`w-12 h-12 border-2 shadow-lg ${
                    dark ? "border-slate-400/50 bg-slate-700" : "border-gray-400/50 bg-gray-200"
                  }`}>
                    <AvatarFallback className={`text-sm font-semibold text-white ${
                      dark ? "bg-gradient-to-r from-slate-500 to-slate-600" : "bg-gradient-to-r from-gray-500 to-gray-600"
                    }`}>
                      {assignedNumber ?? "؟"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border border-white animate-pulse"></div>
                </div>
              </div>

              <div className="flex justify-center mb-4">
                <Users className={`w-12 h-12 animate-bounce ${
                  dark ? "text-slate-400" : "text-gray-600"
                }`} />
              </div>
              
              {!conversationStarted ? (
                <>
                  <h3 className={`text-xl font-bold text-center mb-4 ${
                    dark ? "text-slate-200" : "text-gray-800"
                  }`}>
                    مجموعتك: {matchResult}
                  </h3>
                  
                  <div className={`text-center mb-4 p-3 rounded-xl border ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <p className={`text-lg font-semibold ${
                      dark ? "text-slate-200" : "text-gray-700"
                    }`}>
                      {tableNumber ? `اذهب إلى الطاولة رقم ${tableNumber}` : "سيتم إخبارك بالطاولة قريباً"}
                    </p>
                  </div>

                  <div className={`rounded-xl p-4 border mb-6 ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-label="التالي"
                        className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                        onClick={() => setPromptIndex((i) => (i + 1) % prompts.length)}
                        disabled={prompts.length <= 1}
                      >
                        <ChevronLeftIcon className="w-5 h-5" />
                      </button>
                      <p className={`flex-1 text-center text-base font-medium ${dark ? "text-slate-200" : "text-blue-700"}`}>{prompts[promptIndex]}</p>
                      <button
                        type="button"
                        aria-label="السابق"
                        className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                        onClick={() => setPromptIndex((i) => (i - 1 + prompts.length) % prompts.length)}
                        disabled={prompts.length <= 1}
                      >
                        <ChevronRightIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-center gap-3">
                    <FancyPreviousButton onClick={skipConversation} label="تخطي الحوار" />
                    <FancyNextButton onClick={startConversation} label="ابدأ الحوار" />
                  </div>
                </>
              ) : (
                <>
                  <h3 className={`text-xl font-bold text-center mb-4 ${
                    dark ? "text-slate-200" : "text-gray-800"
                  }`}>
                    حوار جماعي مع {matchResult}
                  </h3>
                  
                  <div className={`text-center mb-4 p-3 rounded-xl border ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <p className={`text-lg font-semibold ${
                      dark ? "text-slate-200" : "text-gray-700"
                    }`}>
                      {tableNumber ? `الطاولة رقم ${tableNumber}` : "سيتم إخبارك بالطاولة قريباً"}
                    </p>
                  </div>

                  <div className={`rounded-xl p-4 border mb-6 ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-label="التالي"
                        className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                        onClick={() => setPromptIndex((i) => (i + 1) % prompts.length)}
                        disabled={prompts.length <= 1}
                      >
                        <ChevronLeftIcon className="w-5 h-5" />
                      </button>
                      <p className={`flex-1 text-center text-base font-medium ${dark ? "text-slate-200" : "text-blue-700"}`}>{prompts[promptIndex]}</p>
                      <button
                        type="button"
                        aria-label="السابق"
                        className="p-2 rounded-full hover:bg-slate-200/40 transition disabled:opacity-40"
                        onClick={() => setPromptIndex((i) => (i - 1 + prompts.length) % prompts.length)}
                        disabled={prompts.length <= 1}
                      >
                        <ChevronRightIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className={`text-center mb-6 p-4 rounded-xl border ${
                    dark 
                      ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                      : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                  }`}>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Clock className={`w-5 h-5 ${
                        dark ? "text-slate-300" : "text-gray-500"
                      }`} />
                      <span className={`text-sm font-medium ${
                        dark ? "text-slate-200" : "text-gray-700"
                      }`}>الوقت المتبقي:</span>
                    </div>
                    <p className={`text-2xl font-bold ${
                      dark ? "text-slate-200" : "text-gray-800"
                    }`}>
                      {formatTime(conversationTimer)}
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <FancyNextButton onClick={skipConversation} label="إنهاء الحوار" />
                  </div>
                </>
              )}
    </div>
  </section>
)}

        {/* Main feedback/result + previous matches layout */}
        {modalStep && (
          <div className="flex flex-col md:flex-row gap-6 w-full max-w-4xl mx-auto mt-12">
            {/* Main Content */}
            <div className="flex-1 min-w-0">
              {modalStep === "feedback" ? (
                <>
                  <h3 className={`text-xl font-bold text-center mb-6 ${dark ? "text-slate-200" : "text-gray-800"}`}>تقييم المحادثة</h3>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${dark ? "text-slate-200" : "text-gray-700"}`}>كيف استمتعت بالمحادثة؟</label>
                      <select
                        value={feedbackAnswers.enjoyment}
                        onChange={(e) => setFeedbackAnswers(prev => ({ ...prev, enjoyment: e.target.value }))}
                        className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 ${dark ? "border-slate-400/30 bg-white/10 text-white focus:ring-slate-400/30 focus:border-slate-400" : "border-blue-400/30 bg-white/90 text-gray-800 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm"}`}
                    >
                      <option value="" className={dark ? "bg-slate-800" : "bg-white"}>اختر تقييم</option>
                      <option value="excellent" className={dark ? "bg-slate-800" : "bg-white"}>ممتاز</option>
                      <option value="good" className={dark ? "bg-slate-800" : "bg-white"}>جيد</option>
                      <option value="average" className={dark ? "bg-slate-800" : "bg-white"}>متوسط</option>
                      <option value="poor" className={dark ? "bg-slate-800" : "bg-white"}>ضعيف</option>
                    </select>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${dark ? "text-slate-200" : "text-gray-700"}`}>هل شعرت بتواصل جيد؟</label>
                      <select
                        value={feedbackAnswers.connection}
                        onChange={(e) => setFeedbackAnswers(prev => ({ ...prev, connection: e.target.value }))}
                        className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 ${dark ? "border-slate-400/30 bg-white/10 text-white focus:ring-slate-400/30 focus:border-slate-400" : "border-blue-400/30 bg-white/90 text-gray-800 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm"}`}
                      >
                        <option value="" className={dark ? "bg-slate-800" : "bg-white"}>اختر إجابة</option>
                        <option value="yes" className={dark ? "bg-slate-800" : "bg-white"}>نعم</option>
                        <option value="somewhat" className={dark ? "bg-slate-800" : "bg-white"}>نوعاً ما</option>
                        <option value="no" className={dark ? "bg-slate-800" : "bg-white"}>لا</option>
                      </select>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${dark ? "text-slate-200" : "text-gray-700"}`}>هل تود مقابلته مرة أخرى؟</label>
                      <select
                        value={feedbackAnswers.wouldMeetAgain}
                        onChange={(e) => setFeedbackAnswers(prev => ({ ...prev, wouldMeetAgain: e.target.value }))}
                        className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 ${dark ? "border-slate-400/30 bg-white/10 text-white focus:ring-slate-400/30 focus:border-slate-400" : "border-blue-400/30 bg-white/90 text-gray-800 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm"}`}
                      >
                        <option value="" className={dark ? "bg-slate-800" : "bg-white"}>اختر إجابة</option>
                        <option value="definitely" className={dark ? "bg-slate-800" : "bg-white"}>بالتأكيد</option>
                        <option value="maybe" className={dark ? "bg-slate-800" : "bg-white"}>ربما</option>
                        <option value="no" className={dark ? "bg-slate-800" : "bg-white"}>لا</option>
                      </select>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${dark ? "text-slate-200" : "text-gray-700"}`}>التقييم العام (من 1 إلى 5)</label>
                      <select
                        value={feedbackAnswers.overallRating}
                        onChange={(e) => setFeedbackAnswers(prev => ({ ...prev, overallRating: e.target.value }))}
                        className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 ${dark ? "border-slate-400/30 bg-white/10 text-white focus:ring-slate-400/30 focus:border-slate-400" : "border-blue-400/30 bg-white/90 text-gray-800 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm"}`}
                      >
                        <option value="" className={dark ? "bg-slate-800" : "bg-white"}>اختر تقييم</option>
                        <option value="5" className={dark ? "bg-slate-800" : "bg-white"}>5 - ممتاز</option>
                        <option value="4" className={dark ? "bg-slate-800" : "bg-white"}>4 - جيد جداً</option>
                        <option value="3" className={dark ? "bg-slate-800" : "bg-white"}>3 - جيد</option>
                        <option value="2" className={dark ? "bg-slate-800" : "bg-white"}>2 - مقبول</option>
                        <option value="1" className={dark ? "bg-slate-800" : "bg-white"}>1 - ضعيف</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-center gap-3 mt-6">
                    <Button
                      onClick={submitFeedback}
                      className="spring-btn bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105"
                    >
                      إرسال التقييم
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className={`text-xl font-bold text-center mb-6 ${dark ? "text-slate-200" : "text-gray-800"}`}>شكراً لك!</h3>
                  <div className={`text-center mb-6 p-6 rounded-xl border ${dark ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30" : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"}`}>
                    <p className={`text-lg font-semibold mb-2 ${dark ? "text-slate-200" : "text-gray-700"}`}>درجة التوافق النهائية</p>
                    <div className={`text-3xl font-bold ${dark ? "text-slate-200" : "text-gray-800"}`}>{compatibilityScore !== null ? `${compatibilityScore}/100` : "غير متوفر"}</div>
                    {isScoreRevealed && (
                      <div className="mt-4">
                        <p className={`text-base font-semibold italic ${dark ? "text-slate-300" : "text-gray-600"}`}>{matchReason}</p>
                        {currentRound === 1 && (
                          <div className="flex flex-col items-center justify-center py-8">
                            <div className="relative w-28 h-28 flex items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/30 to-blue-600/30 shadow-xl border-4 border-cyan-400/40 backdrop-blur-md animate-pulse">
                              <Clock className="w-16 h-16 text-cyan-500 drop-shadow-lg animate-spin-slow" />
                              <div className="absolute inset-0 rounded-full border-4 border-cyan-300/30 animate-pulse"></div>
                            </div>
                            <h2 className="mt-6 text-2xl font-extrabold bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent drop-shadow">بانتظار المنظّم</h2>
                            <p className="mt-2 text-lg font-medium text-cyan-700 animate-fade-in">سيتم إخبارك عندما يبدأ المنظّم الجولة التالية</p>
                            <div className="flex gap-2 mt-6">
                              <span className="w-3 h-3 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                              <span className="w-3 h-3 bg-cyan-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                              <span className="w-3 h-3 bg-cyan-200 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Only show buttons if NOT waiting for host */}
                  {!(currentRound === 1 && isScoreRevealed) && (
                    <div className="flex justify-center gap-3 mt-6">
                      <Button
                        onClick={() => {
                          // History is already maintained incrementally, just show it
                          setShowHistory(true)
                        }}
                        className="spring-btn bg-gradient-to-r from-blue-600 to-cyan-700 hover:from-blue-700 hover:to-cyan-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105"
                      >
                        عرض السجل
                      </Button>
                      <FancyNextButton onClick={restart} label="ابدأ من جديد" />
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Previous Matches Card */}
          </div>
        )}

      </div>

      {/* Form filled prompt modal */}
      {showFormFilledPrompt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`w-full max-w-md rounded-2xl p-8 shadow-2xl border-2 ${dark ? "bg-slate-800 border-slate-600" : "bg-white border-gray-200"}`}>
            <h3 className={`text-xl font-bold text-center mb-4 ${dark ? "text-slate-100" : "text-gray-800"}`}>لقد قمت بتعبئة النموذج مسبقاً</h3>
            <p className={`text-center mb-6 ${dark ? "text-slate-300" : "text-gray-600"}`}>هل ترغب في إعادة تعبئة النموذج أم الانتقال مباشرةً إلى التحليل؟</p>
            <div className="flex gap-4 justify-center">
              <Button
                className="px-6 py-2 font-bold"
                onClick={() => {
                  setShowFormFilledPrompt(false);
                  setStep(2); // Stay on form
                  setAnalysisStarted(false);
                }}
              >
                إعادة تعبئة النموذج
              </Button>
              <Button
                className="px-6 py-2 font-bold"
                variant="outline"
                onClick={() => {
                  setShowFormFilledPrompt(false);
                  setStep(3); // Go to analysis
                  setAnalysisStarted(true);
                }}
              >
                الانتقال إلى التحليل
              </Button>
            </div>
          </div>
        </div>
      )}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`max-w-lg w-auto mx-4 rounded-2xl p-8 shadow-2xl border-2 ${dark ? "bg-slate-800 border-slate-600" : "bg-white border-gray-200"}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-xl font-bold ${dark ? "text-slate-100" : "text-gray-800"}`}>سجل اللقاءات السابقة</h3>
              <Button variant="ghost" onClick={() => setShowHistory(false)}><X /></Button>
            </div>
            <div className="divide-y divide-gray-300/30 max-h-96 overflow-y-auto">
              {historyMatches.length === 0 ? (
                <p className={`text-center ${dark ? "text-slate-300" : "text-gray-600"}`}>لا يوجد سجل بعد.</p>
              ) : (
                historyMatches.map((m, i) => (
                  <div 
                    key={i} 
                    className="py-4 flex flex-col gap-1 cursor-pointer hover:bg-white/5 rounded-lg px-2 transition-all duration-200"
                    onClick={() => {
                      setSelectedHistoryItem(m)
                      setShowHistoryDetail(true)
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-lg ${dark ? "text-blue-200" : "text-blue-700"}`}>#{m.with}</span>
                      <span className={`text-xs px-2 py-1 rounded ${dark ? "bg-slate-700 text-slate-200" : "bg-blue-100 text-blue-700"}`}>الجولة {m.round}</span>
                      <span className={`ml-auto font-bold ${dark ? "text-cyan-300" : "text-cyan-700"}`}>{m.score}%</span>
                    </div>
                    <div className={`text-sm italic ${dark ? "text-slate-300" : "text-gray-600"}`}>{m.reason}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating previous matches card */}
      {typeof step === 'number' && step === 4 && historyMatches.filter(m => m.round <= currentRound).length > 0 && (
        <div className="fixed top-24 right-8 z-10 w-60 bg-white/10 backdrop-blur-lg rounded-2xl p-4 pointer-events-auto select-none shadow-none border border-white/10">
          <h4 className="text-base font-bold text-cyan-200 mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-300" /> اللقاءات السابقة
          </h4>
          <div className="space-y-1">
            {historyMatches.filter(m => m.round <= currentRound).map((m: MatchResultEntry, i: number) => (
              <div 
                key={i} 
                className="flex items-center justify-between text-cyan-100/80 text-sm bg-white/5 rounded-lg px-2 py-1 cursor-pointer hover:bg-white/10 transition-all duration-200"
                onClick={() => {
                  setSelectedHistoryItem(m)
                  setShowHistoryDetail(true)
                }}
              >
                <span className="font-bold">#{m.with}</span>
                <span>{m.score}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {typeof step === 'number' && step === 6 && historyMatches.length > 0 && (
        <div className="fixed top-24 right-8 z-10 w-60 bg-white/10 backdrop-blur-lg rounded-2xl p-4 pointer-events-auto select-none shadow-none border border-white/10">
          <h4 className="text-base font-bold text-cyan-200 mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-300" /> اللقاءات السابقة
          </h4>
          <div className="space-y-1">
            {historyMatches.map((m: MatchResultEntry, i: number) => (
              <div 
                key={i} 
                className="flex items-center justify-between text-cyan-100/80 text-sm bg-white/5 rounded-lg px-2 py-1 cursor-pointer hover:bg-white/10 transition-all duration-200"
                onClick={() => {
                  setSelectedHistoryItem(m)
                  setShowHistoryDetail(true)
                }}
              >
                <span className="font-bold">#{m.with}</span>
                <span>{m.score}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Detail Modal */}
      {showHistoryDetail && selectedHistoryItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`max-w-lg w-auto mx-4 rounded-2xl p-8 shadow-2xl border-2 ${dark ? "bg-slate-800 border-slate-600" : "bg-white border-gray-200"}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-bold ${dark ? "text-slate-100" : "text-gray-800"}`}>تفاصيل اللقاء</h3>
              <Button variant="ghost" onClick={() => setShowHistoryDetail(false)}><X /></Button>
            </div>
            
            <div className="space-y-6">
              {/* Match Header */}
              <div className={`text-center p-6 rounded-xl border ${dark ? "bg-slate-700/50 border-slate-600" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center ${dark ? "bg-blue-600/20 border-blue-400" : "bg-blue-100 border-blue-300"}`}>
                    <span className={`text-2xl font-bold ${dark ? "text-blue-200" : "text-blue-700"}`}>#{assignedNumber}</span>
                  </div>
                  <div className={`text-3xl ${dark ? "text-slate-300" : "text-gray-500"}`}>×</div>
                  <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center ${dark ? "bg-cyan-600/20 border-cyan-400" : "bg-cyan-100 border-cyan-300"}`}>
                    <span className={`text-2xl font-bold ${dark ? "text-cyan-200" : "text-cyan-700"}`}>#{selectedHistoryItem.with}</span>
                  </div>
                </div>
                <h4 className={`text-lg font-semibold mb-2 ${dark ? "text-slate-200" : "text-gray-800"}`}>الجولة {selectedHistoryItem.round}</h4>
                <div className={`text-4xl font-bold ${dark ? "text-cyan-300" : "text-cyan-600"}`}>{selectedHistoryItem.score}%</div>
                <div className={`text-sm ${dark ? "text-slate-400" : "text-gray-600"}`}>درجة التوافق</div>
              </div>

              {/* Compatibility Details */}
              <div className={`p-4 rounded-xl border ${dark ? "bg-slate-700/30 border-slate-600" : "bg-gray-50 border-gray-200"}`}>
                <h5 className={`font-semibold mb-3 ${dark ? "text-slate-200" : "text-gray-800"}`}>سبب التوافق</h5>
                <p className={`text-sm leading-relaxed ${dark ? "text-slate-300" : "text-gray-700"}`}>{selectedHistoryItem.reason}</p>
              </div>

              {/* Match Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-xl border ${dark ? "bg-slate-700/30 border-slate-600" : "bg-gray-50 border-gray-200"}`}>
                  <h5 className={`font-semibold mb-2 ${dark ? "text-slate-200" : "text-gray-800"}`}>رقم الطاولة</h5>
                  <p className={`text-lg font-bold ${dark ? "text-cyan-300" : "text-cyan-600"}`}>
                    {selectedHistoryItem.table_number || "غير محدد"}
                  </p>
                </div>
                <div className={`p-4 rounded-xl border ${dark ? "bg-slate-700/30 border-slate-600" : "bg-gray-50 border-gray-200"}`}>
                  <h5 className={`font-semibold mb-2 ${dark ? "text-slate-200" : "text-gray-800"}`}>نوع المباراة</h5>
                  <p className={`text-lg font-bold ${dark ? "text-blue-300" : "text-blue-600"}`}>
                    {selectedHistoryItem.type}
                  </p>
                </div>
              </div>

              {/* Compatibility Score Bar */}
              <div className={`p-4 rounded-xl border ${dark ? "bg-slate-700/30 border-slate-600" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex justify-between items-center mb-2">
                  <h5 className={`font-semibold ${dark ? "text-slate-200" : "text-gray-800"}`}>مستوى التوافق</h5>
                  <span className={`font-bold ${dark ? "text-cyan-300" : "text-cyan-600"}`}>{selectedHistoryItem.score}%</span>
                </div>
                <div className={`w-full h-3 rounded-full ${dark ? "bg-slate-600" : "bg-gray-200"}`}>
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      selectedHistoryItem.score >= 80 ? "bg-green-500" :
                      selectedHistoryItem.score >= 60 ? "bg-yellow-500" :
                      selectedHistoryItem.score >= 40 ? "bg-orange-500" :
                      "bg-red-500"
                    }`}
                    style={{ width: `${selectedHistoryItem.score}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className={dark ? "text-slate-400" : "text-gray-500"}>منخفض</span>
                  <span className={dark ? "text-slate-400" : "text-gray-500"}>متوسط</span>
                  <span className={dark ? "text-slate-400" : "text-gray-500"}>عالي</span>
                </div>
              </div>
            </div>

            <div className="flex justify-center mt-6">
              <Button
                onClick={() => setShowHistoryDetail(false)}
                className="spring-btn bg-gradient-to-r from-blue-600 to-cyan-700 hover:from-blue-700 hover:to-cyan-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105"
              >
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating previous matches card */}
    </div>
  )
}
