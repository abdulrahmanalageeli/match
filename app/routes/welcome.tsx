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

const SleekTimeline = ({ currentStep, totalSteps, dark, formCompleted }: { currentStep: number; totalSteps: number; dark: boolean; formCompleted?: boolean }) => {
  const stepLabels = ["الجولة ٢", "انتظار", "الجولة ١", "تحليل", "النموذج"];
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
                {/* Check mark for completed form */}
                {isFormStep && formCompleted && (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
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
  const [step, setStep] = useState(-1)
  const [showFinalResult, setShowFinalResult] = useState(false)
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
  const [phase, setPhase] = useState<"form" | "waiting" | "matching" | null>(null)
  const [tableNumber, setTableNumber] = useState<number | null>(null)
  const [compatibilityScore, setCompatibilityScore] = useState<number | null>(null)
  const [isScoreRevealed, setIsScoreRevealed] = useState(false)
  const [conversationStarted, setConversationStarted] = useState(false)
  const [conversationTimer, setConversationTimer] = useState(300) // 5 minutes
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
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
  const [announcement, setAnnouncement] = useState<any>(null)
  const [emergencyPaused, setEmergencyPaused] = useState(false)
  const [welcomeText, setWelcomeText] = useState("")
  const [welcomeTyping, setWelcomeTyping] = useState(false)

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

    const fullText = `مرحباً بك لاعب رقم ${assignedNumber} في نظام التوافق الذكي! 🎯\n\nسنقوم بتحليل شخصيتك ومطابقتك مع أشخاص آخرين بناءً على اهتماماتك وصفاتك.`
    
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
    if (!personalitySummary || personalitySummary === "ما تم إنشاء ملخص.") {
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
  }, [personalitySummary])

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

          const res2 = await fetch("/api/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "event-phase",
              match_id: "00000000-0000-0000-0000-000000000000",
            }),
          });
          const phaseData = await res2.json();

          if (phaseData.phase === "matching") {
            if (hasFilledForm) {
              setStep(4); // Round 1 matching
              fetchMatches();
            } else {
              setStep(-2); // late joiner, too late
            }
          } else if (phaseData.phase === "waiting") {
            if (hasFilledForm) {
              setStep(3); // Analysis/waiting
            } else {
              setStep(2); // Form
            }
          } else if (phaseData.phase === "form") {
            if (hasFilledForm) {
              setStep(3); // Analysis/waiting with personality summary
            } else {
              setStep(2); // Form
            }
          } else if (phaseData.phase === "waiting2") {
            if (hasFilledForm) {
              setStep(5); // Waiting between rounds
            } else {
              setStep(2); // Form
            }
          } else if (phaseData.phase === "matching2") {
            if (hasFilledForm) {
              setStep(6); // Round 2 matching
              fetchMatches(2);
            } else {
              setStep(-2); // late joiner, too late
            }
          } else {
            // Default: show welcome page
            setStep(-1);
          }
        }

      } catch (err) {
        console.error("Error resolving token:", err)
      } finally {
        setIsResolving(false) // ✅ only set false after async finishes
      }
    }

    resolveToken()
  }, [token])

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

        const data = await res.json()
        
        // Update phase
        setPhase(data.phase)
        
        // Update announcements and emergency pause
        setAnnouncement({
          message: data.announcement,
          type: data.announcement_type,
          time: data.announcement_time
        })
        setEmergencyPaused(data.emergency_paused || false)

        // Handle step transitions based on phase changes
        if (assignedNumber) {
          // If we're in welcome page (-1) and phase changes to form, move to step 0
          if (step === -1 && data.phase === "form") {
            setStep(0)
          }
          
          // If we're in step 3 (analysis/waiting) and phase changes to matching, fetch matches for round 1
          if (step === 3 && data.phase === "matching") {
            await fetchMatches(1)
            setStep(4)
          }
          
          // If we're in step 4 (round 1 matching) and phase changes to waiting2, move to step 5
          if (step === 4 && data.phase === "waiting2") {
            setStep(5)
          }
          
          // If we're in step 5 (waiting between rounds) and phase changes to matching2, fetch matches for round 2
          if (step === 5 && data.phase === "matching2") {
            await fetchMatches(2)
            setStep(6)
          }
          
          // If we're in step 2 (form) and phase changes to matching, move to step 3
          if (step === 2 && data.phase === "matching") {
            setStep(3)
          }
          
          // If we're in step 2 (form) and phase changes to waiting, move to step 3
          if (step === 2 && data.phase === "waiting") {
            setStep(3)
          }

          // If we're in step 1 (number entry) and phase changes to form, move to step 2
          if (step === 1 && data.phase === "form") {
            setStep(2)
          }

          // If we're in step 0 (welcome) and phase changes to form, move to step 1
          if (step === 0 && data.phase === "form") {
            setStep(1)
          }

          // If we're in any step and phase changes to waiting2 (waiting for round 2), move to step 5
          if (data.phase === "waiting2" && step !== 5) {
            setStep(5)
          }

          // If we're in any step and emergency pause is activated, stay on current step but show pause overlay
          // (this is handled by the emergencyPaused state and overlay)
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
    setShowFeedbackModal(true)
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

      // 3. Go to summary step
      next()

      // 4. Wait 30s, then auto-match
      // After summary, move to waiting screen
      setStep(4) // but 4 = waiting
    } catch (err) {
      console.error("Submit error:", err)
      setPersonalitySummary("ما قدرنا نولّد تحليل شخصيتك.")
      next()
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

  const fetchMatches = async (roundOverride?: number) => {
    try {
      const roundToFetch = roundOverride || currentRound;
      const myMatches = await fetch("/api/get-my-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_number: assignedNumber, round: roundToFetch }),
      })
      const data = await myMatches.json()
      const matches = data.matches as MatchResultEntry[]
      const match = matches[0]
      if (match) {
        setMatchResult(match.with)
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
          setShowFeedbackModal(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [conversationStarted, conversationTimer, emergencyPaused])

  const submitFeedback = () => {
    setIsScoreRevealed(true)
    setShowFeedbackModal(false)
    setShowFinalResult(true)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
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

  if (!isResolving && phase !== "form" && step === 0) {
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
              <div className={`h-full rounded-full animate-pulse ${
                announcement.type === "warning" ? "bg-yellow-400" :
                announcement.type === "error" ? "bg-red-400" :
                announcement.type === "success" ? "bg-green-400" :
                "bg-blue-400"
              }`} style={{
                animation: 'progress 10s linear infinite'
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
          <SleekTimeline currentStep={step} totalSteps={5} dark={dark} formCompleted={step >= 3} />
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
              }`}>أدخل رقمك المخصص</h2>
              <p className={`text-sm mb-6 ${
                dark ? "text-slate-300" : "text-gray-600"
              }`}>منظّم الحدث أعطاك رقم. اكتبه هنا علشان نكمل.</p>
              <div className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  value={assignedNumber ?? ""}
                  onChange={(e) => setAssignedNumber(Number(e.target.value))}
                  className={`mx-auto block h-24 w-24 text-center text-4xl font-bold rounded-xl border-2 backdrop-blur-sm shadow-lg focus:outline-none transition-all duration-300 [appearance:textfield] ${
                    dark 
                      ? "border-slate-400/50 bg-white/10 text-slate-200 focus:ring-4 focus:ring-slate-400/30 focus:border-slate-400"
                      : "border-blue-400/50 bg-white/90 text-gray-800 focus:ring-4 focus:ring-blue-400/30 focus:border-blue-500 shadow-md"
                  }`}
                />
                <div className={`absolute inset-0 rounded-xl blur-xl opacity-50 ${
                  dark 
                    ? "bg-gradient-to-r from-slate-400/20 to-slate-500/20"
                    : "bg-gradient-to-r from-gray-400/20 to-gray-500/20"
                }`}></div>
              </div>
            </div>
            <div className="flex justify-center gap-3">
              <FancyPreviousButton onClick={previous} label="رجوع" />
              <FancyNextButton onClick={next} label="استمرار" />
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
            </div>

            <div className="flex justify-center gap-3">
              <FancyPreviousButton onClick={restart} label="الرجوع للبداية" />
              <FancyNextButton
                onClick={() => {
                  setStep(4)
                }}
                label="عرض النتائج الآن"
              />
            </div>
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
                    توأم روحك في الجولة الثانية هو رقم {matchResult}
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
                    حوار مع رقم {matchResult} (الجولة الثانية)
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

        {/* Final Result Step */}
        {showFinalResult && (
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
                <Heart className={`w-12 h-12 animate-pulse ${
                  dark ? "text-slate-400" : "text-gray-600"
                }`} />
              </div>
              
              <h3 className={`text-xl font-bold text-center mb-4 ${
                dark ? "text-slate-200" : "text-gray-800"
              }`}>
                شكراً لك!
              </h3>
              
              <div className={`text-center mb-6 p-6 rounded-xl border ${
                dark 
                  ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                  : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
              }`}>
                <p className={`text-lg font-semibold mb-2 ${
                  dark ? "text-slate-200" : "text-gray-700"
                }`}>
                  درجة التوافق النهائية
                </p>
                <div className={`text-3xl font-bold ${
                  dark ? "text-slate-200" : "text-gray-800"
                }`}>
                  {compatibilityScore !== null ? `${compatibilityScore}/100` : "غير متوفر"}
                </div>
              </div>

              {isScoreRevealed && (
                <div className={`rounded-xl p-4 border mb-6 ${
                  dark 
                    ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30"
                    : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"
                }`}>
                  <p className={`text-sm text-center italic ${
                    dark ? "text-slate-300" : "text-gray-600"
                  }`}>
                    {matchReason}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-center gap-3">
              {currentRound === 1 && isScoreRevealed && (
                <FancyNextButton
                  onClick={() => {
                    setCurrentRound(2)
                    setShowFinalResult(false)
                    setIsScoreRevealed(false)
                    setConversationStarted(false)
                    setConversationTimer(300)
                    setStep(4) // Go to waiting for round 2
                  }}
                  label="ابدأ الجولة الثانية"
                />
              )}
              <FancyNextButton onClick={restart} label="ابدأ من جديد" />
            </div>
          </section>
        )}
      </div>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-md backdrop-blur-xl border rounded-2xl p-8 shadow-2xl ${
            dark ? "bg-white/10 border-white/20" : "bg-black/10 border-gray-300/30"
          }`}>
            <h3 className={`text-xl font-bold text-center mb-6 ${
              dark ? "text-slate-200" : "text-gray-800"
            }`}>
              تقييم المحادثة
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  dark ? "text-slate-200" : "text-gray-700"
                }`}>
                  كيف استمتعت بالمحادثة؟
                </label>
                <select
                  value={feedbackAnswers.enjoyment}
                  onChange={(e) => setFeedbackAnswers(prev => ({ ...prev, enjoyment: e.target.value }))}
                  className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 ${
                    dark 
                      ? "border-slate-400/30 bg-white/10 text-white focus:ring-slate-400/30 focus:border-slate-400"
                      : "border-blue-400/30 bg-white/90 text-gray-800 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm"
                  }`}
                >
                  <option value="" className={dark ? "bg-slate-800" : "bg-white"}>اختر تقييم</option>
                  <option value="excellent" className={dark ? "bg-slate-800" : "bg-white"}>ممتاز</option>
                  <option value="good" className={dark ? "bg-slate-800" : "bg-white"}>جيد</option>
                  <option value="average" className={dark ? "bg-slate-800" : "bg-white"}>متوسط</option>
                  <option value="poor" className={dark ? "bg-slate-800" : "bg-white"}>ضعيف</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  dark ? "text-slate-200" : "text-gray-700"
                }`}>
                  هل شعرت بتواصل جيد؟
                </label>
                <select
                  value={feedbackAnswers.connection}
                  onChange={(e) => setFeedbackAnswers(prev => ({ ...prev, connection: e.target.value }))}
                  className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 ${
                    dark 
                      ? "border-slate-400/30 bg-white/10 text-white focus:ring-slate-400/30 focus:border-slate-400"
                      : "border-blue-400/30 bg-white/90 text-gray-800 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm"
                  }`}
                >
                  <option value="" className={dark ? "bg-slate-800" : "bg-white"}>اختر إجابة</option>
                  <option value="yes" className={dark ? "bg-slate-800" : "bg-white"}>نعم</option>
                  <option value="somewhat" className={dark ? "bg-slate-800" : "bg-white"}>نوعاً ما</option>
                  <option value="no" className={dark ? "bg-slate-800" : "bg-white"}>لا</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  dark ? "text-slate-200" : "text-gray-700"
                }`}>
                  هل تود مقابلته مرة أخرى؟
                </label>
                <select
                  value={feedbackAnswers.wouldMeetAgain}
                  onChange={(e) => setFeedbackAnswers(prev => ({ ...prev, wouldMeetAgain: e.target.value }))}
                  className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 ${
                    dark 
                      ? "border-slate-400/30 bg-white/10 text-white focus:ring-slate-400/30 focus:border-slate-400"
                      : "border-blue-400/30 bg-white/90 text-gray-800 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm"
                  }`}
                >
                  <option value="" className={dark ? "bg-slate-800" : "bg-white"}>اختر إجابة</option>
                  <option value="definitely" className={dark ? "bg-slate-800" : "bg-white"}>بالتأكيد</option>
                  <option value="maybe" className={dark ? "bg-slate-800" : "bg-white"}>ربما</option>
                  <option value="no" className={dark ? "bg-slate-800" : "bg-white"}>لا</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  dark ? "text-slate-200" : "text-gray-700"
                }`}>
                  التقييم العام (من 1 إلى 5)
                </label>
                <select
                  value={feedbackAnswers.overallRating}
                  onChange={(e) => setFeedbackAnswers(prev => ({ ...prev, overallRating: e.target.value }))}
                  className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 ${
                    dark 
                      ? "border-slate-400/30 bg-white/10 text-white focus:ring-slate-400/30 focus:border-slate-400"
                      : "border-blue-400/30 bg-white/90 text-gray-800 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm"
                  }`}
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
          </div>
        </div>
      )}
    </div>
  )
}
