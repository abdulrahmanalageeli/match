import React, { useState, useEffect, useRef } from "react"
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
  Star,
  ThumbsUp,
  Meh,
  ThumbsDown,
  Handshake,
  Zap as ZapIcon,
  HelpCircle,
  Ban,
  Smile,
  Frown,
  FileText,
  XCircle,
  AlertCircle,
  Send,
  Activity,
  CheckCircle,
  LockKeyhole,
  Search,
  CheckSquare,
  ChevronRight,
  ChevronLeft,
} from "lucide-react"
import { Button } from "../../components/ui/button"
import { Timeline, TimelineItem } from "../../components/ui/timeline"
import { Avatar, AvatarFallback } from "../../components/ui/avatar"
import { Badge } from "../../components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Progress } from "../../components/ui/progress"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { Checkbox } from "../../components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group"
import { Label } from "../../components/ui/label"
import { Textarea } from "../../components/ui/textarea"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { Slider } from "../../components/ui/slider"
import { Switch } from "../../components/ui/switch"
import { Avatar as AvatarComponent } from "../../components/ui/avatar"
import "../../app/app.css"
import MatchResult from "./MatchResult"
import AIQuestionsGenerator from "../components/AIQuestionsGenerator"
import SurveyComponent from "../components/SurveyComponent"
import PromptTopicsModal from "../components/PromptTopicsModal"
import CircularProgressBar from "../components/CircularProgressBar"

interface SurveyData {
  answers: Record<string, string | string[]>
  termsAccepted: boolean
  dataConsent: boolean
  mbtiType?: string
  attachmentStyle?: string
  communicationStyle?: string
  lifestylePreferences?: string
  coreValues?: string
  vibeDescription?: string
  idealPersonDescription?: string
  name?: string
  gender?: string
  phoneNumber?: string
}

const SleekTimeline = ({ currentStep, totalSteps, dark, formCompleted, currentRound, totalRounds }: { currentStep: number; totalSteps: number; dark: boolean; formCompleted?: boolean; currentRound?: number; totalRounds?: number }) => {
  const stepLabels = ["الجولة ١", "تحليل", "النموذج"];
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
  const [secureToken, setSecureToken] = useState<string | null>(null)
  const [showTokenModal, setShowTokenModal] = useState(false)

  const [freeTime, setFreeTime] = useState("")
  const [friendDesc, setFriendDesc] = useState("")
  const [preference, setPreference] = useState("")
  const [uniqueTrait, setUniqueTrait] = useState("")
  const [personalitySummary, setPersonalitySummary] = useState("")
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(30)
  const [matchResult, setMatchResult] = useState<string | null>(null)
  const [matchReason, setMatchReason] = useState<string>("")
  const [isRepeatMatch, setIsRepeatMatch] = useState<boolean>(false)
  const [phase, setPhase] = useState<"registration" | "form" | "waiting" | "round_1" | /* "waiting_2" | "round_2" | "waiting_3" | "round_3" | "waiting_4" | "round_4" | "group_phase" | */ null>(null)
  const [tableNumber, setTableNumber] = useState<number | null>(null)
  const [compatibilityScore, setCompatibilityScore] = useState<number | null>(null)
  const [isScoreRevealed, setIsScoreRevealed] = useState(false)
  const [conversationStarted, setConversationStarted] = useState(false)
  const [conversationTimer, setConversationTimer] = useState(1800) // 30 minutes
  const [globalTimerActive, setGlobalTimerActive] = useState(false)
  const [globalTimerStartTime, setGlobalTimerStartTime] = useState<string | null>(null)
  const [globalTimerDuration, setGlobalTimerDuration] = useState(1800)
  const [timerRestored, setTimerRestored] = useState(false)
  const [timerRestoreAttempted, setTimerRestoreAttempted] = useState(false)
  
  // Utility function to clear timer localStorage backup
  const clearTimerLocalStorage = () => {
    localStorage.removeItem('timerRestored');
    localStorage.removeItem('timerStartTime');
    localStorage.removeItem('timerDuration');
    console.log("🔄 Cleared timer localStorage backup");
  }
  
  const [feedbackAnswers, setFeedbackAnswers] = useState({
    compatibilityRate: 50, // 0-100 scale
    conversationQuality: 3, // 1-5 scale
    personalConnection: 3, // 1-5 scale
    sharedInterests: 3, // 1-5 scale
    comfortLevel: 3, // 1-5 scale
    communicationStyle: 3, // 1-5 scale
    wouldMeetAgain: 3, // 1-5 scale
    overallExperience: 3, // 1-5 scale
    recommendations: ""
  })
  const searchParams = useSearchParams()[0]
  const token = searchParams.get("token")
  const [isResolving, setIsResolving] = useState(true)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [isTokenValid, setIsTokenValid] = useState<boolean | null>(null)
  const [typewriterText, setTypewriterText] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [typewriterCompleted, setTypewriterCompleted] = useState(false)
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
  // const [secureToken, setSecureToken] = useState<string>("")
  const [conversationStarters, setConversationStarters] = useState<string[]>([])
  const [showConversationStarters, setShowConversationStarters] = useState(false)
  const [generatingStarters, setGeneratingStarters] = useState(false)
  const [surveyData, setSurveyData] = useState<SurveyData>({
    answers: {},
    termsAccepted: false,
    dataConsent: false
  })
  const [showSurvey, setShowSurvey] = useState(false)
  const [partnerStartedTimer, setPartnerStartedTimer] = useState(false)
  const [partnerEndedTimer, setPartnerEndedTimer] = useState(false)
  const [timerEnded, setTimerEnded] = useState(false)
  const [lastTimerStatus, setLastTimerStatus] = useState<string | null>(null)
  const [timerWasStarted, setTimerWasStarted] = useState(false);
  const [showPartnerStartedNotification, setShowPartnerStartedNotification] = useState(false);
  const [showPromptTopicsModal, setShowPromptTopicsModal] = useState(false);
  const [showHistoryBox, setShowHistoryBox] = useState(false);
  const [historyBoxPosition, setHistoryBoxPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [formFilledChoiceMade, setFormFilledChoiceMade] = useState(false); // Track if user has made choice about form filled prompt

  const historyBoxRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

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

  // Add these refs near the top of your component
  const lastRoundRef = useRef<number | null>(null);
  const lastPhaseRef = useRef<string | null>(null);
  const historyIconRef = useRef<HTMLDivElement | null>(null);

  // Helper function to handle history icon interactions
  const handleHistoryIconClick = (event: React.MouseEvent) => {
    try {
      if (historyMatches.length === 0) return;
      
      const rect = event.currentTarget.getBoundingClientRect();
      setHistoryBoxPosition({
        x: rect.right + 8, // Position to the right of the icon
        y: rect.bottom + 8  // Position below the icon
      });
      setShowHistoryBox(!showHistoryBox); // Toggle visibility
    } catch (error) {
      console.error("Error handling history icon click:", error)
      setShowHistoryBox(false)
    }
  };

  // Drag functionality for history modal
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!historyBoxRef.current) return;
    
    const rect = historyBoxRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    setHistoryBoxPosition({
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  // Auto-scroll to feedback when it appears
  useEffect(() => {
    if (modalStep === "feedback" && feedbackRef.current) {
      // Small delay to ensure the modal is fully rendered
      setTimeout(() => {
        feedbackRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 100);
    }
  }, [modalStep]);



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
      setTypewriterCompleted(false)
      return
    }

    // If typewriter is already completed, don't restart
    if (typewriterCompleted) {
      return
    }

    // If the summary is empty or invalid, don't start
    if (!personalitySummary || personalitySummary.trim() === "") {
      return
    }

    console.log("🔄 Typewriter: Starting typewriter effect")
    setIsTyping(true)
    setTypewriterText("")
    
    let index = 0
    const typeInterval = setInterval(() => {
      if (index < personalitySummary.length) {
        setTypewriterText(personalitySummary.substring(0, index + 1))
        index++
      } else {
        clearInterval(typeInterval)
        setTypewriterText(personalitySummary) // Ensure final text is set
        setIsTyping(false)
        setTypewriterCompleted(true)
        console.log("🔄 Typewriter: Completed - STOPPING FOREVER")
      }
    }, 30) // Speed of typing

    return () => clearInterval(typeInterval)
  }, [analysisStarted, personalitySummary])

  useEffect(() => {
    const resolveToken = async () => {
      if (!token) {
        setIsResolving(false)
        return
      }

      try {
        const res = await fetch("/api/token-handler", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve", secure_token: token }),
        })
        const data = await res.json()
        
        if (data.success) {
          // Token is valid
          setIsTokenValid(true)
          setTokenError(null)
          setAssignedNumber(data.assigned_number);
          setSecureToken(token); // Store the secure token
          // If we just created a token, show modal once and clear flag
          try {
            if (sessionStorage.getItem('justCreatedToken') === '1') {
              const justToken = sessionStorage.getItem('justCreatedTokenValue')
              if (justToken) setSecureToken(justToken)
              setShowTokenModal(true)
              sessionStorage.removeItem('justCreatedToken')
              sessionStorage.removeItem('justCreatedTokenValue')
            }
          } catch (_) {}
          if (data.summary) {
            console.log("📖 Loaded summary from database:", data.summary)
            setPersonalitySummary(data.summary)
          } else {
            console.log("📖 No summary found in database")
          }
          // Check if user has filled the survey using new structure
          const hasFilledForm = data.survey_data && data.survey_data.answers && Object.keys(data.survey_data.answers).length > 0;
          if (hasFilledForm) {
            setSurveyData(data.survey_data);
          }
          
          // Reset all states to prevent stuck states on refresh
          setModalStep(null);
          setIsScoreRevealed(false);
          setShowConversationStarters(false);
          setConversationStarters([]);
          setGeneratingStarters(false);
          setShowHistory(false);
          setShowHistoryDetail(false);
          setSelectedHistoryItem(null);
          setAnimationStep(0);
          setFeedbackAnswers({
            compatibilityRate: 50,
            conversationQuality: 3,
            personalConnection: 3,
            sharedInterests: 3,
            comfortLevel: 3,
            communicationStyle: 3,
            wouldMeetAgain: 3,
            overallExperience: 3,
            recommendations: ""
          });
          setShowFormFilledPrompt(false);
          setAnalysisStarted(false);
          setTypewriterText("");
          setIsTyping(false);
          setTypewriterCompleted(false);
          
          setStep(-1);
          // Fetch current event state including timer state
          const res2 = await fetch("/api/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "get-event-state",
              match_id: "00000000-0000-0000-0000-000000000000",
            }),
          });
          
          if (!res2.ok) {
            console.error("Failed to fetch event state:", res2.status, res2.statusText);
            // Set default values if API fails
            setPhase("registration");
            setCurrentRound(1);
            setTotalRounds(4);
            setIsRepeatMatch(false);
          } else {
            const eventData = await res2.json();
            setPhase(eventData.phase || "registration");
            setCurrentRound(eventData.current_round || 1);
            setTotalRounds(eventData.total_rounds || 4);
            setIsRepeatMatch(false);
            
            // Restore timer state if active (only attempt once per page load)
            if (!timerRestoreAttempted && eventData.global_timer_active && eventData.global_timer_start_time) {
              setTimerRestoreAttempted(true);
              console.log("🔄 Restoring timer state on page load");
              const startTime = new Date(eventData.global_timer_start_time).getTime();
              const now = new Date().getTime();
              const elapsed = Math.floor((now - startTime) / 1000);
              const remaining = Math.max(0, (eventData.global_timer_duration || 1800) - elapsed);
              
              if (remaining > 0) {
                console.log(`✅ Restoring active timer with ${remaining}s remaining`);
                setGlobalTimerActive(true);
                setGlobalTimerStartTime(eventData.global_timer_start_time);
                setGlobalTimerDuration(eventData.global_timer_duration || 1800);
                setConversationStarted(true);
                setConversationTimer(remaining);
                setTimerEnded(false);
                setTimerRestored(true); // Mark that timer was restored
                
                // Store timer state in localStorage as backup
                localStorage.setItem('timerRestored', 'true');
                localStorage.setItem('timerStartTime', eventData.global_timer_start_time);
                localStorage.setItem('timerDuration', String(eventData.global_timer_duration || 1800));
                
                console.log("🔄 Timer restoration completed, timerRestored set to true");
              } else {
                console.log("⏰ Timer expired, showing feedback");
                setGlobalTimerActive(false);
                setConversationStarted(false);
                setConversationTimer(0);
                setTimerEnded(true);
                setModalStep("feedback");
              }
            } else if (!timerRestoreAttempted) {
              setTimerRestoreAttempted(true);
              console.log("🔄 No active timer to restore from server");
              
              // Check localStorage as fallback
              const localStorageTimerRestored = localStorage.getItem('timerRestored');
              const localStorageStartTime = localStorage.getItem('timerStartTime');
              const localStorageDuration = localStorage.getItem('timerDuration');
              
              if (localStorageTimerRestored === 'true' && localStorageStartTime && localStorageDuration) {
                console.log("🔄 Attempting timer restoration from localStorage");
                const startTime = new Date(localStorageStartTime).getTime();
                const now = new Date().getTime();
                const elapsed = Math.floor((now - startTime) / 1000);
                const remaining = Math.max(0, parseInt(localStorageDuration) - elapsed);
                
                if (remaining > 0) {
                  console.log(`✅ Restoring timer from localStorage with ${remaining}s remaining`);
                  setGlobalTimerActive(true);
                  setGlobalTimerStartTime(localStorageStartTime);
                  setGlobalTimerDuration(parseInt(localStorageDuration));
                  setConversationStarted(true);
                  setConversationTimer(remaining);
                  setTimerEnded(false);
                  setTimerRestored(true);
                } else {
                  console.log("⏰ localStorage timer expired, clearing backup");
                  clearTimerLocalStorage();
                }
              }
            }

            // --- NEW LOGIC ---
            if (hasFilledForm) {
              if (eventData.phase !== "form") {
                // Registration closed but user filled form, skip to correct step
                if (eventData.phase && eventData.phase.startsWith("round_")) {
                  const roundNumber = parseInt(eventData.phase.split('_')[1]);
                  setPendingMatchRound(roundNumber);
                  setStep(4); // Show matches
                } else if (eventData.phase && eventData.phase.startsWith("waiting_")) {
                  setStep(3); // Show analysis/waiting
                // } else if (eventData.phase === "group_phase") {
                //   setStep(7); // Show group phase
                //   // Fetch group matches when loading in group phase
                //   console.log("🎯 Initial load: Fetching group matches for group_phase")
                //   fetchGroupMatches();
                } else if (eventData.phase === "waiting") {
                  // User completed form and we're in waiting phase
                  setStep(3); // Show analysis/waiting
                }
              } else {
                // In form phase and already filled form, show prompt
                setShowFormFilledPrompt(true);
              }
            } else {
              // User hasn't filled form yet, check current phase
              if (eventData.phase === "form") {
                setStep(2); // Show form
              } else if (eventData.phase === "waiting") {
                setStep(2); // Still show form even in waiting phase if not filled
              } else if (eventData.phase && eventData.phase.startsWith("round_")) {
                // User missed the form phase, show a message or redirect
                setStep(2); // Show form anyway
              }
            }
            // --- END NEW LOGIC ---
          }
        } else {
          // Token is invalid
          setIsTokenValid(false)
          setTokenError(data.error || "الرابط غير صحيح أو منتهي الصلاحية")
          console.error("Invalid token:", data.error)
        }
      } catch (err) {
        console.error("Error resolving token:", err)
        setIsTokenValid(false)
        setTokenError("حدث خطأ في التحقق من الرابط. يرجى المحاولة مرة أخرى.")
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

  // Handle group phase data loading
  // useEffect(() => {
  //   if (assignedNumber && phase === "group_phase" && step === 7) {
  //     console.log("🎯 Loading group matches for step 7", { assignedNumber, phase, step, matchResult })
  //     fetchGroupMatches()
  //   }
  // }, [assignedNumber, phase, step])

  // Combined real-time updates for all steps
  useEffect(() => {
    // Don't start polling until initial resolution is complete
    if (isResolving) return

    const interval = setInterval(async () => {
      try {
        console.log("🔄 Participant: Polling for updates...")
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
        
        // Handle global timer state with improved synchronization
        console.log(`🔄 Participant: Received data - global_timer_active: ${data.global_timer_active}, global_timer_start_time: ${data.global_timer_start_time}, global_timer_duration: ${data.global_timer_duration}`)
        
        // Handle timer state updates
        // We need to handle both active timers and timer end scenarios
        const hasActiveTimer = data.global_timer_active && data.global_timer_start_time;
        const shouldUpdateActiveTimer = (!timerRestored || hasActiveTimer) && data.global_timer_start_time;
        
        console.log("🔄 Timer state debug - hasActiveTimer:", hasActiveTimer, "shouldUpdateActiveTimer:", shouldUpdateActiveTimer, "globalTimerActive:", globalTimerActive, "conversationStarted:", conversationStarted, "data.global_timer_active:", data.global_timer_active);
        
        // Handle active timer updates
        if (shouldUpdateActiveTimer) {
          if (data.global_timer_active && data.global_timer_start_time) {
            const startTime = new Date(data.global_timer_start_time).getTime()
            const now = new Date().getTime()
            const elapsed = Math.floor((now - startTime) / 1000)
            const remaining = Math.max(0, (data.global_timer_duration || 1800) - elapsed)
            
            console.log(`🔄 Participant: Global timer data - active: ${data.global_timer_active}, remaining: ${remaining}s, round: ${data.global_timer_round}, elapsed: ${elapsed}s`)
            
            if (remaining > 0) {
              if (!globalTimerActive) {
                console.log("🚀 Participant: Global timer detected, starting conversation")
                setGlobalTimerActive(true)
                setConversationStarted(true)
                setTimerEnded(false)
                setModalStep(null) // Clear any existing modal
              }
              setGlobalTimerStartTime(data.global_timer_start_time)
              setGlobalTimerDuration(data.global_timer_duration || 1800)
              setConversationTimer(remaining)
              console.log(`✅ Participant: Timer set to ${remaining}s`)
            } else {
              // Timer expired
              if (globalTimerActive) {
                console.log("⏰ Participant: Global timer expired, showing feedback")
                setGlobalTimerActive(false)
                setConversationStarted(false)
                setConversationTimer(0)
                setTimerEnded(true)
                setModalStep("feedback")
                
                // Clear localStorage backup when timer expires naturally
                clearTimerLocalStorage();
              }
            }
          }
        } else {
          console.log("🔄 Participant: Skipping active timer update - timer was just restored or no valid timer data")
        }
        
        // Handle timer end scenarios (admin ending timer)
        if (data.global_timer_active === false && (globalTimerActive || conversationStarted)) {
          console.log("🛑 Participant: Timer ended by admin, showing feedback")
          console.log("🛑 Debug - globalTimerActive:", globalTimerActive, "conversationStarted:", conversationStarted, "data.global_timer_active:", data.global_timer_active)
          setGlobalTimerActive(false)
          setConversationStarted(false)
          setConversationTimer(0)
          setTimerEnded(true)
          setModalStep("feedback")
          clearTimerLocalStorage();
        }
        
        // Clear the restored flag after first polling cycle, but only if we have valid timer data
        // Add a delay to ensure restored timer state is properly established
        if (timerRestored && data.global_timer_start_time) {
          setTimeout(() => {
            console.log("🔄 Clearing timerRestored flag after delay");
            setTimerRestored(false)
          }, 2000) // Wait 2 seconds before clearing the flag
        }
        
        // Reset conversation state if emergency pause is active
        if (data.emergency_paused) {
          setConversationStarted(false);
          setConversationTimer(1800);
          setModalStep(null);
          setTimerEnded(false); // Reset timer ended flag during emergency pause
          
          // Clear localStorage backup during emergency pause
          clearTimerLocalStorage();
          console.log("🔄 Cleared timer localStorage backup due to emergency pause");
        }

        // Handle step transitions based on phase changes
        if (assignedNumber) {
          // Update current round and total rounds for ALL phase changes
          setCurrentRound(data.current_round || 1);
          setTotalRounds(data.total_rounds || 4);
          setIsRepeatMatch(false);
          
          console.log(`🔄 Polling detected phase: ${data.phase}, current step: ${step}`);
          
          // Check if user has completed the form (only if we don't already have survey data)
          if (!surveyData.answers || Object.keys(surveyData.answers).length === 0) {
            try {
              const userRes = await fetch("/api/token-handler", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "resolve", secure_token: secureToken }),
              });
              const userData = await userRes.json();
              if (userData.success && userData.survey_data && userData.survey_data.answers) {
                setSurveyData(userData.survey_data);
                              if (userData.summary && userData.summary !== personalitySummary) {
                console.log("🔄 Updating summary from polling:", userData.summary)
                setPersonalitySummary(userData.summary);
              } else if (userData.summary === personalitySummary) {
                console.log("🔄 Summary unchanged, skipping update")
              }
              }
            } catch (err) {
              console.error("Failed to fetch user data during polling:", err);
            }
          }
          
          // HANDLE ALL PHASE TRANSITIONS
          console.log(`🔄 Phase transition check: current phase=${data.phase}, lastPhaseRef=${lastPhaseRef.current}, lastRoundRef=${lastRoundRef.current}, step=${step}`);
          
          if (data.phase && data.phase.startsWith("round_")) {
            // Round phases (round_1 only - single round mode)
            const roundNumber = parseInt(data.phase.split('_')[1]);
            // Only handle round 1, comment out multi-round logic
            if (roundNumber === 1 && (lastRoundRef.current !== roundNumber || lastPhaseRef.current !== data.phase)) {
              console.log(`🔄 Round phase change detected: ${lastPhaseRef.current} → ${data.phase} (Round ${lastRoundRef.current} → ${roundNumber})`);
              
              await fetchMatches(roundNumber);
              setStep(4);
              
              // Reset all states for clean transition (but preserve global timer state)
              if (!globalTimerActive && !timerRestored) {
                setConversationTimer(1800);
                setConversationStarted(false);
                setModalStep(null);
                setIsScoreRevealed(false);
                setShowConversationStarters(false);
                setConversationStarters([]);
                setGeneratingStarters(false);
                setShowHistory(false);
                setShowHistoryDetail(false);
                setSelectedHistoryItem(null);
                setAnimationStep(0);
                          setFeedbackAnswers({
              compatibilityRate: 50,
              conversationQuality: 3,
              personalConnection: 3,
              sharedInterests: 3,
              comfortLevel: 3,
              communicationStyle: 3,
              wouldMeetAgain: 3,
              overallExperience: 3,
              recommendations: ""
            });
                setTypewriterCompleted(false);
                setTimerEnded(false);
                setIsRepeatMatch(false);
                setPartnerStartedTimer(false);
                setPartnerEndedTimer(false);
              } else {
                console.log("🔄 Skipping timer reset - global timer active or timer was restored");
              }
              
              lastRoundRef.current = roundNumber;
              lastPhaseRef.current = data.phase;
              
              console.log(`✅ Successfully transitioned to ${data.phase}`);
            }
        } else if (data.phase && data.phase.startsWith("waiting_")) {
            // Waiting phases (waiting only - single round mode)
            console.log(`🔄 Waiting phase change detected: ${data.phase} (from step ${step})`);
            setStep(5);
            // Only reset timer if not in global timer mode
            if (!globalTimerActive && !timerRestored) {
              setConversationStarted(false);
              setModalStep(null);
              setTimerEnded(false);
              setPartnerStartedTimer(false);
              setPartnerEndedTimer(false);
            } else {
              console.log("🔄 Skipping timer reset in waiting phase - global timer active or timer was restored");
            }
            setIsScoreRevealed(false);
            setShowConversationStarters(false);
            setConversationStarters([]);
            setGeneratingStarters(false);
            
            // Update refs for waiting phase
            const waitingRound = parseInt(data.phase.split('_')[1]);
            lastRoundRef.current = waitingRound;
            lastPhaseRef.current = data.phase;
            
            console.log(`✅ Successfully transitioned to ${data.phase}`);
        // } else if (data.phase === "group_phase") {
        //     // Group phase - only reset if actually transitioning TO group phase
        //     if (lastPhaseRef.current !== "group_phase") {
        //       console.log(`🔄 Group phase change detected: ${lastPhaseRef.current} → group_phase (from step ${step})`);
        //     setStep(7);
        //     // Only reset timer if not in global timer mode
        //     if (!globalTimerActive && !timerRestored) {
        //       setConversationTimer(1800);
        //       setConversationStarted(false);
        //       setModalStep(null);
        //       setIsScoreRevealed(false);
        //       setTimerEnded(false);
        //       setPartnerStartedTimer(false);
        //       setPartnerEndedTimer(false);
        //       setShowConversationStarters(false);
        //       setConversationStarters([]);
        //       setGeneratingStarters(false);
        //       setShowHistory(false);
        //       setShowHistoryDetail(false);
        //       setSelectedHistoryItem(null);
        //       setAnimationStep(0);
        //     } else {
        //       console.log("🔄 Skipping timer reset in group phase - global timer active or timer was restored");
        //     }
        //     fetchGroupMatches();
        //       
        //       lastPhaseRef.current = "group_phase";
        //       console.log(`✅ Successfully transitioned to group_phase`);
        //     } else {
        //       console.log(`🔄 Already in group_phase, maintaining current timer state`);
        //     }
          } else if (data.phase === "waiting") {
            // General waiting phase
            console.log(`🔄 General waiting phase change detected (from step ${step})`);
            setStep(3);
            // Only reset timer if not in global timer mode
            if (!globalTimerActive && !timerRestored) {
              setConversationStarted(false);
              setModalStep(null);
              setTimerEnded(false);
              setPartnerStartedTimer(false);
              setPartnerEndedTimer(false);
            } else {
              console.log("🔄 Skipping timer reset in general waiting phase - global timer active or timer was restored");
            }
            setIsScoreRevealed(false);
            setShowConversationStarters(false);
            setConversationStarters([]);
            setGeneratingStarters(false);
            console.log(`✅ Successfully transitioned to waiting`);
                  } else if (data.phase === "form") {
            // Form phase
            console.log(`🔄 Form phase change detected (from step ${step})`);
            
            if (step === -1) {
              setStep(0);
              setFormFilledChoiceMade(false); // Reset choice when transitioning from initial state
            } else if (step === 0) {
              setStep(2);
              setFormFilledChoiceMade(false); // Reset choice when transitioning from registration
            } else if (step === 1) {
              setStep(2);
              setFormFilledChoiceMade(false); // Reset choice when transitioning from registration
            } else if (step >= 3) {
              // Don't force users back to step 2 if they've already made their choice
              // Only reset if they haven't made a choice yet
              if (!formFilledChoiceMade) {
                setStep(2);
                // Only reset timer if not in global timer mode
                if (!globalTimerActive && !timerRestored) {
                  setConversationStarted(false);
                  setModalStep(null);
                  setTimerEnded(false);
                  setPartnerStartedTimer(false);
                  setPartnerEndedTimer(false);
                } else {
                  console.log("🔄 Skipping timer reset in form phase - global timer active or timer was restored");
                }
                setIsScoreRevealed(false);
                setShowConversationStarters(false);
                setConversationStarters([]);
                setGeneratingStarters(false);
                // Reset form filled choice when returning to form phase from other phases
                setFormFilledChoiceMade(false);
              } else {
                console.log("🔄 User has already made their choice, staying on current step");
              }
            }
          
          // Handle form filled prompt logic - only show if user hasn't made a choice yet
          // This prevents the prompt from appearing repeatedly after user makes their choice
          if (surveyData.answers && Object.keys(surveyData.answers).length > 0 && !formFilledChoiceMade) {
            if (!showFormFilledPrompt && step === 2) {
              setShowFormFilledPrompt(true);
            }
          } else {
            setShowFormFilledPrompt(false);
          }
            console.log(`✅ Successfully transitioned to form phase`);
          } else if (data.phase === "registration") {
            // Registration phase
            if (step > 0) {
              console.log(`🔄 Registration phase change detected (from step ${step})`);
              setStep(0);
              // Only reset timer if not in global timer mode
              if (!globalTimerActive && !timerRestored) {
                setConversationStarted(false);
                setModalStep(null);
                setTimerEnded(false);
                setPartnerStartedTimer(false);
                setPartnerEndedTimer(false);
              } else {
                console.log("🔄 Skipping timer reset in registration phase - global timer active or timer was restored");
              }
              console.log(`✅ Successfully transitioned to registration`);
            }
          } else {
            // Reset refs if not in a specific phase
            lastRoundRef.current = null;
            lastPhaseRef.current = null;
          }
        } // End of assignedNumber check
      } catch (err) {
        console.error("Failed to fetch real-time updates", err)
      }
    }, 1000) // Always poll every second for better responsiveness
  
    return () => clearInterval(interval)
  }, [step, currentRound, assignedNumber, isResolving, globalTimerActive])

  const next = () => setStep((s) => Math.min(s + 1, 6))
  const restart = () => {
    setStep(-1)
    setPersonalitySummary("")
    setIsRepeatMatch(false)
  }
  const previous = () => setStep((s) => Math.max(s - 1, -2))

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  // Debug: Log step changes
  useEffect(() => {
    console.log(`🔄 Step changed to: ${step} (phase: ${phase})`);
  }, [step, phase])

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
  
  // startConversation function removed - now handled by global timer from admin


  
  const handleSubmit = async (submittedData?: any) => {
    const dataToUse = submittedData || surveyData;
    console.log("🚀 handleSubmit called with data:", dataToUse);
    if (!dataToUse || !dataToUse.answers || Object.keys(dataToUse.answers).length === 0) {
      console.log("❌ survey data answers is empty or undefined", dataToUse);
      // alert("يرجى إكمال الاستبيان أولاً");
      return;
    }
    setLoading(true)
    try {
      // 1. Save participant with survey data (including calculated personality types)
      const res1 = await fetch("/api/save-participant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_number: assignedNumber,
          survey_data: dataToUse,
        }),
      })
      const data1 = await res1.json()
      if (!res1.ok) throw new Error(data1.error)
  
      // 2. Skip AI summary generation for now
      const newSummary = "تم حفظ بياناتك بنجاح. سيتم تحليل شخصيتك قريباً."
      console.log("📝 Using default summary:", newSummary)
      setPersonalitySummary(newSummary)
      // Reset typewriter state for new summary
      setTypewriterCompleted(false)
      setTypewriterText("")
      setIsTyping(false)
      
      // Save the default summary to database
      const saveRes = await fetch("/api/save-participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_number: assignedNumber,
          summary: newSummary,
        }),
      })
      
      if (!saveRes.ok) {
        console.error("❌ Failed to save summary to database")
      } else {
        console.log("✅ Summary saved to database successfully")
      }
      // Hide survey and move to waiting/analysis step after successful submission
      setShowSurvey(false)
      setAnalysisStarted(true)
      setStep(3)
      setFormFilledChoiceMade(false) // Reset choice for future form submissions
    } catch (err) {
      console.error("Submit error:", err)
      setPersonalitySummary("تم حفظ بياناتك بنجاح.")
      // Don't auto-advance on error either
    } finally {
      setLoading(false)
    }
  }

  const handleSurveySubmit = (data: any) => {
    console.log("📨 handleSurveySubmit called with data:", data);
    setSurveyData(data);
    // Don't hide survey immediately - let the loading state handle it
    handleSubmit(data);
  }
      
  type MatchResultEntry = {
    with: string
    type: string
    reason: string
    round: number
    table_number: number | null
    score: number
    is_repeat_match?: boolean
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
      console.log("API response data:", data)
      const matches = data.matches || []
      console.log("Matches array:", matches)
      
      // Find current round match
      const currentRoundMatch = matches.find((m: MatchResultEntry) => m.round === round)
      console.log("Current round match:", currentRoundMatch)
      
      if (currentRoundMatch) {
        setMatchResult(currentRoundMatch.with)
        setMatchReason(currentRoundMatch.reason)
        setCompatibilityScore(currentRoundMatch.score)
        setTableNumber(currentRoundMatch.table_number)
        setIsRepeatMatch(currentRoundMatch.is_repeat_match || false)
        
        // Incrementally add to history if not already present
        // setHistoryMatches(prev => {
        //   const exists = prev.some(m => m.with === currentRoundMatch.with && m.round === currentRoundMatch.round)
        //   if (!exists) {
        //     return [...prev, currentRoundMatch]
        //   }
        //   return prev
        // })
      }
    } catch (err) {
      console.error("Error fetching matches:", err)
    }
  }

  const fetchGroupMatches = async () => {
    if (!assignedNumber) {
      console.warn("⚠️ Cannot fetch group matches: assignedNumber is null")
      return
    }
    
    console.log("🔍 Fetching group matches for participant:", assignedNumber)
    try {
      const myMatches = await fetch("/api/get-my-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_number: assignedNumber, match_type: "محايد", round: 0 }),
      })
      
      if (!myMatches.ok) {
        console.error("Failed to fetch group matches:", myMatches.status, myMatches.statusText)
        setMatchResult("؟")
        setMatchReason("فشل في جلب بيانات المجموعة")
        return
      }
      
      const data = await myMatches.json()
      console.log("📊 Group matches response:", data)
      
      const matches = data.matches || []
      const match = matches[0]
      
      if (match) {
        // Include current user in the participants display
        const allParticipants = [assignedNumber, ...match.participants].sort((a, b) => a - b)
        console.log("👥 Group participants:", allParticipants)
        
        setMatchResult(allParticipants.join(" ، "))
        setMatchReason(match.reason || "مجموعة بتوافق عالي")
        setTableNumber(match.table_number)
        setCompatibilityScore(match.score)
      } else {
        console.warn("⚠️ No group matches found")
        setMatchResult("لم يتم العثور على مجموعة")
        setMatchReason("لم يتم تكوين المجموعات بعد")
        setTableNumber(null)
        setCompatibilityScore(null)
      }
    } catch (err) {
      console.error("❌ Error fetching group matches:", err)
      setMatchResult("؟")
      setMatchReason("صار خطأ بالتوافق، حاول مره ثانية.")
    }
  }
  


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

  const submitFeedback = async () => {
    // Save feedback to database
    if (assignedNumber && currentRound) {
      try {
        const response = await fetch("/api/save-participant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assigned_number: assignedNumber,
            round: currentRound,
            feedback: feedbackAnswers
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          console.error("Failed to save feedback:", data.error)
          // Continue with UI updates even if saving fails
        } else {
          console.log("✅ Feedback saved successfully")
        }
      } catch (error) {
        console.error("Error saving feedback:", error)
        // Continue with UI updates even if saving fails
      }
    }

    setIsScoreRevealed(true)
    setModalStep("result")
    
    // Incrementally update history when feedback is submitted
    if (assignedNumber && matchResult) {
      // Add current match to history immediately
      const currentMatch = {
        with: matchResult,
                      type: "مقابلة فردية",
        reason: matchReason,
        round: currentRound,
        table_number: tableNumber,
        score: compatibilityScore || 0,
        is_repeat_match: isRepeatMatch
      }
      
      setHistoryMatches(prev => {
        try {
          // Check if this match already exists in history
          const exists = prev.some(m => m.with === currentMatch.with && m.round === currentMatch.round)
          if (!exists) {
            console.log("Adding match to history:", currentMatch)
            return [...prev, currentMatch]
          }
          return prev
        } catch (error) {
          console.error("Error updating history matches:", error)
          return prev
        }
      })
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Function to convert technical compatibility reason to natural Arabic description
  const formatCompatibilityReason = (reason: string): { components: Array<{ name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }>; originalReason: string } => {
    try {
      if (!reason || typeof reason !== 'string') return { components: [], originalReason: "معلومات التوافق غير متوفرة" }
      
      // Extract scores from the technical format
      const mbtiMatch = reason.match(/MBTI:.*?\((\d+)%\)/)
      const attachmentMatch = reason.match(/التعلق:.*?\((\d+)%\)/)
      const communicationMatch = reason.match(/التواصل:.*?\((\d+)%\)/)
      const lifestyleMatch = reason.match(/نمط الحياة:.*?\((\d+)%\)/)
      const coreValuesMatch = reason.match(/القيم الأساسية:.*?\((\d+)%\)/)
      const vibeMatch = reason.match(/التوافق الشخصي:.*?\((\d+)%\)/)
      
      const mbtiScore = mbtiMatch ? parseInt(mbtiMatch[1]) || 0 : 0
      const attachmentScore = attachmentMatch ? parseInt(attachmentMatch[1]) || 0 : 0
      const communicationScore = communicationMatch ? parseInt(communicationMatch[1]) || 0 : 0
      const lifestyleScore = lifestyleMatch ? parseInt(lifestyleMatch[1]) || 0 : 0
      const coreValuesScore = coreValuesMatch ? parseInt(coreValuesMatch[1]) || 0 : 0
      const vibeScore = vibeMatch ? parseInt(vibeMatch[1]) || 0 : 0
    
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
    } catch (error) {
      console.error("Error in formatCompatibilityReason:", error)
      return { components: [], originalReason: "معلومات التوافق غير متوفرة" }
    }
  }

  // Database timer utility functions
  const startDatabaseTimer = async (round: number, duration: number = 1800) => {
    if (!assignedNumber) return false;
    
    try {
      const res = await fetch("/api/get-my-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          assigned_number: assignedNumber,
          round: round,
          duration: duration,
          // match_type: phase === "group_phase" ? "محايد" : "محايد"
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log("🚀 Database timer response:", data);
        
        // Handle case where timer is already active
        if (data.message === "Timer already active") {
          console.log("🔄 Timer already active, syncing with existing timer");
          return true;
        }
        
        return data.success;
      } else {
        console.error("Failed to start database timer:", res.status);
        return false;
      }
      } catch (err) {
      console.error("Error starting database timer:", err);
      return false;
    }
  };

  const getDatabaseTimerStatus = async (round: number) => {
    if (!assignedNumber) return null;
    
    try {
      const res = await fetch("/api/get-my-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get-status",
          assigned_number: assignedNumber,
          round: round,
          // match_type: phase === "group_phase" ? "محايد" : "محايد"
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        return data;
      } else {
        console.error("Failed to get database timer status:", res.status);
        return null;
      }
    } catch (err) {
      console.error("Error getting database timer status:", err);
      return null;
    }
  };

  const finishDatabaseTimer = async (round: number) => {
    if (!assignedNumber) return false;
    
    try {
      const res = await fetch("/api/get-my-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finish",
          assigned_number: assignedNumber,
          round: round,
          // match_type: phase === "group_phase" ? "محايد" : "محايد"
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log("⏰ Database timer finished:", data);
        return data.success;
      } else {
        console.error("Failed to finish database timer:", res.status);
        return false;
      }
    } catch (err) {
      console.error("Error finishing database timer:", err);
      return false;
    }
  };



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

  // Unified timer management system (DISABLED - using global timer instead)
  /*
  useEffect(() => {
    if (!assignedNumber || !currentRound || emergencyPaused || globalTimerActive) return;

    let syncInterval: NodeJS.Timeout;
    let localInterval: NodeJS.Timeout;

    const syncWithDatabase = async () => {
      try {
        // Skip timer sync for group phase - each participant manages their own timer
        // if (phase === "group_phase") {
          console.log("🔄 Group phase detected, skipping timer sync");
          return;
        }

        const timerStatus = await getDatabaseTimerStatus(currentRound);
        
        if (!timerStatus || !timerStatus.success) {
          console.log("🔄 No timer status from database, using defaults");
          return;
        }

        console.log(`🔄 Database timer status: ${timerStatus.status}, remaining: ${timerStatus.remaining_time}s`);

        // Only show notifications when status actually changes
        const currentStatus = timerStatus.status === 'active' && timerStatus.remaining_time > 0 ? 'active' : 
                            timerStatus.status === 'finished' || timerStatus.remaining_time <= 0 ? 'finished' : 'not_started';
        
        if (currentStatus !== lastTimerStatus) {
          setLastTimerStatus(currentStatus);
          
          if (currentStatus === 'active') {
            if (!timerWasStarted) {
              setShowPartnerStartedNotification(true);
              setTimeout(() => setShowPartnerStartedNotification(false), 3000);
            }
            setTimerWasStarted(true);
            // Timer is active in database
            if (!conversationStarted && !timerEnded) {
              // Partner started timer, auto-start for this participant
              console.log(`🔄 Partner started timer, auto-starting for participant ${assignedNumber}`);
              setConversationTimer(timerStatus.remaining_time);
              setConversationStarted(true);
              setPartnerStartedTimer(true);
              setTimerEnded(false);
              
              // Show notification for 3 seconds
              setTimeout(() => {
                setPartnerStartedTimer(false);
              }, 3000);
            } else if (conversationStarted && !timerEnded) {
              // Sync timer with database - only if there's a significant difference
              const timeDiff = Math.abs(conversationTimer - timerStatus.remaining_time);
              if (timeDiff > 3) { // Only sync if difference is more than 3 seconds
                console.log(`🔄 Syncing timer: local=${conversationTimer}, db=${timerStatus.remaining_time}`);
                setConversationTimer(timerStatus.remaining_time);
              }
            }
          } else if (currentStatus === 'finished') {
            // Timer finished in database
            if (conversationStarted && !timerEnded) {
              console.log(`⏰ Timer finished in database, ending for participant ${assignedNumber}`);
              setConversationStarted(false);
              setModalStep("feedback");
              setPartnerStartedTimer(false);
              setPartnerEndedTimer(true);
              setTimerEnded(true);
              
              // Show notification for 3 seconds
              setTimeout(() => {
                setPartnerEndedTimer(false);
              }, 3000);
            } else if (!conversationStarted && !timerEnded) {
              // Timer finished but we weren't in conversation - partner ended it
              if (timerWasStarted) {
                setPartnerEndedTimer(true);
                setTimeout(() => {
                  setPartnerEndedTimer(false);
                }, 3000);
              }
            } else if (timerEnded) {
              // We already ended the timer manually, don't show notification
              console.log(`⏰ Timer finished in database, but we already ended it manually`);
            }
          } else if (currentStatus === 'not_started') {
            // No timer active, reset to default state
            if (conversationStarted || timerEnded) {
              console.log("🔄 No timer active in database, resetting to default");
            setConversationTimer(1800);
            setConversationStarted(false);
              setTimerEnded(false);
              setPartnerStartedTimer(false);
              setPartnerEndedTimer(false);
            }
            setTimerWasStarted(false);
          }
        } else {
          // Status hasn't changed, just sync timer if active
          if (currentStatus === 'active' && conversationStarted && !timerEnded) {
            const timeDiff = Math.abs(conversationTimer - timerStatus.remaining_time);
            if (timeDiff > 3) { // Only sync if difference is more than 3 seconds
              console.log(`🔄 Syncing timer: local=${conversationTimer}, db=${timerStatus.remaining_time}`);
              setConversationTimer(timerStatus.remaining_time);
            }
          }
        }
      } catch (error) {
        console.error("Error syncing with database:", error);
      }
    };

    // Initial sync (skip for group phase)
    // if (phase !== "group_phase") {
    syncWithDatabase();
    // Set up polling interval
    syncInterval = setInterval(syncWithDatabase, 2000);
    }

    // Set up local countdown (only when conversation is active)
    if (conversationStarted && !timerEnded && conversationTimer > 0) {
      localInterval = setInterval(() => {
        setConversationTimer((prev) => {
          if (prev <= 1) {
            // Local timer finished, finish in database
            console.log("⏰ Local timer finished, finishing in database");
            setConversationStarted(false);
            setModalStep("feedback");
            setTimerEnded(true);
            finishDatabaseTimer(currentRound);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (syncInterval) clearInterval(syncInterval);
      if (localInterval) clearInterval(localInterval);
    };
  }, [assignedNumber, currentRound, conversationStarted, conversationTimer, timerEnded, emergencyPaused, lastTimerStatus, phase]);
  */

  // Start database timer when conversation starts (disabled when global timer is active)
  useEffect(() => {
    if (!assignedNumber || !currentRound || !conversationStarted || globalTimerActive) return;
    
    const startTimer = async () => {
      try {
        const result = await startDatabaseTimer(currentRound, 1800); // Always use 1800 seconds (30 minutes)
        if (result) {
          console.log("🚀 Database timer started successfully");
        } else {
          console.error("❌ Failed to start database timer");
        }
      } catch (error) {
        console.error("Error starting database timer:", error);
      }
    };

    startTimer();
  }, [conversationStarted, assignedNumber, currentRound]);

  // Reset timer state when round changes (but don't interfere with global timer or restored timer)
  useEffect(() => {
    if (assignedNumber && currentRound && !globalTimerActive && !timerRestored) {
      setConversationTimer(1800);
      setConversationStarted(false);
      setTimerEnded(false);
      setPartnerStartedTimer(false);
      setPartnerEndedTimer(false);
      setLastTimerStatus(null); // Reset status tracking for new round
    }
  }, [currentRound, assignedNumber, globalTimerActive, timerRestored]);

  // Global timer activation effect
  useEffect(() => {
    if (globalTimerActive && globalTimerStartTime && globalTimerDuration) {
      console.log("🚀 Participant: Activating global timer state")
      setConversationStarted(true)
      setTimerEnded(false)
      setModalStep(null) // Clear any existing modal
    }
  }, [globalTimerActive, globalTimerStartTime, globalTimerDuration])

  // Global timer local countdown effect
  useEffect(() => {
    if (!globalTimerActive || !globalTimerStartTime || conversationTimer <= 0) return;

    console.log("🔄 Starting global timer countdown effect");

    const countdownInterval = setInterval(() => {
      const startTime = new Date(globalTimerStartTime).getTime();
      const now = new Date().getTime();
      const elapsed = Math.floor((now - startTime) / 1000);
      const remaining = Math.max(0, globalTimerDuration - elapsed);

      if (remaining > 0) {
        setConversationTimer(remaining);
      } else {
        // Timer expired locally, but let the polling handle the state change
        console.log("⏰ Global timer countdown expired locally");
        setConversationTimer(0);
        
        // Clear localStorage backup when timer expires locally
        clearTimerLocalStorage();
        
        clearInterval(countdownInterval);
      }
    }, 1000);

    return () => {
      console.log("🔄 Clearing global timer countdown interval");
      clearInterval(countdownInterval);
    };
  }, [globalTimerActive, globalTimerStartTime, globalTimerDuration]);

  // Reset timer restored flag when timer ends
  useEffect(() => {
    if (!globalTimerActive && timerRestored) {
      setTimerRestored(false)
      // Clear localStorage backup
      clearTimerLocalStorage();
    }
  }, [globalTimerActive, timerRestored])

  // Token validation loading UI
  if (token && isResolving) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Animated Background Elements */}
        <div className="absolute inset-0">
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

        {/* Main Content */}
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full">
            <div className="bg-white/10 backdrop-blur-xl border border-cyan-400/30 rounded-2xl p-8 shadow-2xl">
              <div className="text-center">
                {/* Loading Icon */}
                <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                  <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
                
                <h1 className="text-2xl font-bold text-white mb-4">جاري التحقق من الرابط</h1>
                <p className="text-cyan-200 mb-6 leading-relaxed">
                  يرجى الانتظار بينما نتحقق من صحة الرابط...
                </p>
                
                <div className="flex justify-center">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-cyan-400 rounded-full animate-bounce"></div>
                    <div className="w-3 h-3 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-3 h-3 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Token validation error UI
  if (token && !isResolving && isTokenValid === false) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Animated Background Elements */}
        <div className="absolute inset-0">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className={`absolute rounded-full blur-xl opacity-20 animate-pulse ${
                i % 2 === 0 ? 'bg-red-400' : 'bg-orange-500'
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

        {/* Main Content */}
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full">
            <div className="bg-white/10 backdrop-blur-xl border border-red-400/30 rounded-2xl p-8 shadow-2xl">
              <div className="text-center">
                {/* Error Icon */}
                <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <XCircle className="w-10 h-10 text-white" />
                </div>
                
                <h1 className="text-2xl font-bold text-white mb-4">خطأ في الرابط</h1>
                <p className="text-red-200 mb-6 leading-relaxed">
                  {tokenError}
                </p>
                
                <div className="space-y-4">
                  <button
                    onClick={() => window.location.href = '/'}
                    className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 shadow-lg"
                  >
                    العودة للصفحة الرئيسية
                  </button>
                  
                  <div className="text-center">
                    <p className="text-slate-400 text-sm mb-2">هل تحتاج مساعدة؟</p>
                    <p className="text-slate-300 text-sm">
                      تواصل مع المنظم للحصول على رابط صحيح
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

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
                              // Mark just-created to show modal after redirect
                              sessionStorage.setItem('justCreatedToken', '1')
                              sessionStorage.setItem('justCreatedTokenValue', data.secure_token)
                              window.location.href = `/welcome?token=${data.secure_token}`
                            } else {
                              // alert("❌ فشل في الحصول على رقم")
                            }
                          } catch (err) {
                            console.error("Error creating token:", err)
                            // alert("❌ فشل في الحصول على رقم")
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
                              // alert("يرجى إدخال رمز صحيح")
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
      {/* Token Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`w-full max-w-md mx-4 rounded-2xl border p-5 shadow-2xl ${dark ? "bg-slate-800/95 border-slate-700" : "bg-white/95 border-gray-200"}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-lg font-bold ${dark ? "text-slate-100" : "text-gray-800"}`}>تم إنشاء حسابك بنجاح</h3>
              <button onClick={() => setShowTokenModal(false)} className={`rounded-full p-1 ${dark ? "hover:bg-slate-700" : "hover:bg-gray-100"}`}>✕</button>
            </div>
            <p className={`text-sm mb-3 ${dark ? "text-slate-300" : "text-gray-600"}`}>هذا رمز الوصول الخاص بك. احتفظ به أو انسخه للعودة لاحقاً إلى تاريخك.</p>
            <div className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 mb-3 ${dark ? "border-slate-600 bg-slate-900/40" : "border-gray-300 bg-gray-50"}`}>
              <div className={`font-mono text-sm select-all ${dark ? "text-cyan-300" : "text-blue-700"}`}>{secureToken}</div>
              <Button
                onClick={() => { if (secureToken) navigator.clipboard.writeText(secureToken) }}
                className="h-8 px-3 text-xs"
              >نسخ</Button>
            </div>
            <div className={`rounded-xl p-3 mb-4 ${dark ? "bg-cyan-500/10 border border-cyan-400/20" : "bg-blue-50 border border-blue-200"}`}>
              <p className={`text-xs ${dark ? "text-cyan-200" : "text-blue-700"}`}>نصيحة: قم بحفظ هذه الصفحة في المفضلة حتى تعود بسهولة إلى رحلتك وتاريخك لاحقاً.</p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowTokenModal(false)}
                className="h-8 px-3 text-xs"
              >حسناً</Button>
              <Button
                onClick={() => {
                  if (secureToken) {
                    setShowTokenModal(false)
                    window.history.replaceState(null, "", `/welcome?token=${secureToken}`)
                  }
                }}
                className="h-8 px-3 text-xs"
              >فتح الصفحة برمزك</Button>
            </div>
          </div>
        </div>
      )}
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-400 mx-auto"></div>
          <p className="text-slate-300 text-xl font-medium" dir="rtl">جارٍ التحميل...</p>
        </div>
      </div>
    )
  }
  
    if (!isResolving && (phase === "round_1" || /* phase === "round_2" || phase === "round_3" || phase === "round_4" || phase === "group_phase" || */ false) && step === 0) {
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
    <>
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
              // Timeline labels in RTL order: ["الجولة ١", "تحليل", "النموذج"]
              // RTL indices: 2=Round1, 1=Analysis, 0=Form
              let timelineStep = 0;
              
              if (phase === "registration") timelineStep = 0; // Form (rightmost)
              else if (phase === "form") timelineStep = 0; // Form (rightmost)
              else if (phase === "waiting") timelineStep = 1; // Analysis
              else if (phase === "round_1") timelineStep = 2; // Round 1
              // Commented out multi-round and groups logic
              // else if (phase === "waiting_2") timelineStep = 2; // Round 1 (waiting for round 2)
              // else if (phase === "round_2") timelineStep = 3; // Round 2
              // else if (phase === "waiting_3") timelineStep = 3; // Round 2 (waiting for round 3)
              // else if (phase === "round_3") timelineStep = 4; // Round 3
              // else if (phase === "waiting_4") timelineStep = 4; // Round 3 (waiting for round 4)
              // else if (phase === "round_4") timelineStep = 5; // Round 4
              // else if (phase === "group_phase") timelineStep = 3; // Groups (removed)
              else {
                // Fallback to step-based calculation if phase is not set
                if (step === 0) timelineStep = 0; // Welcome screen -> Form
                else if (step === 1) timelineStep = 0; // Number entry -> Form
                else if (step === 2) timelineStep = 0; // Form -> Form
                else if (step === 3) timelineStep = 1; // Analysis -> Analysis
                else if (step === 4) timelineStep = 2; // Round 1 -> Round 1
                // Commented out multi-round and groups logic
                // else if (step === 5) timelineStep = Math.min(2 + currentRound, 3); // Waiting -> Next Round (max 3 for Round 2)
                // else if (step === 7) timelineStep = 3; // Group phase -> Groups (removed)
                else timelineStep = 0;
              }
              
              console.log(`Timeline Debug: phase=${phase}, currentRound=${currentRound}, step=${step}, timelineStep=${timelineStep}`);
              return timelineStep;
            })()} 
                            totalSteps={3} 
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
                        sessionStorage.setItem('justCreatedToken', '1')
                        sessionStorage.setItem('justCreatedTokenValue', data.secure_token)
                        window.location.href = `/welcome?token=${data.secure_token}`
                      } else {
                        // alert("❌ فشل في الحصول على رقم")
                      }
                    } catch (err) {
                      console.error("Error creating token:", err)
                      // alert("❌ فشل في الحصول على رقم")
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
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
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
                }`}>استبيان التوافق الشامل</h2>
                <p className={`text-sm text-center ${
                  dark ? "text-slate-300" : "text-gray-600"
                }`}>أجب على الأسئلة التالية لتحليل شخصيتك بدقة</p>
              </div>

              {!showSurvey ? (
                <div className="text-center space-y-4">
                  <p className={`text-sm ${
                    dark ? "text-slate-300" : "text-gray-600"
                  }`}>
                    سيتم جمع بياناتك وفقاً لمعايير حماية البيانات السعودية
                  </p>
                  <button
                    onClick={() => {
                      // alert("Button clicked!")
                      console.log("🔘 ابدأ الاستبيان button clicked")
                      console.log("showSurvey will be set to true")
                      setShowSurvey(true)
                      setTimeout(() => {
                        // alert("showSurvey should now be true")
                      }, 100)
                    }}
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 shadow-sm hover:bg-primary/90 h-9 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
                  >
                    ابدأ الاستبيان
                  </button>
                </div>
              ) : (
                <>
                  {console.log("🎯 SurveyComponent is being rendered")}
                                  <SurveyComponent
                  onSubmit={handleSurveySubmit}
                  surveyData={surveyData}
                  setSurveyData={setSurveyData}
                  loading={loading}
                />
                </>
              )}
            </div>

            {!showSurvey && (
              <div className="flex justify-center gap-3">
                <FancyPreviousButton onClick={previous} label="رجوع" />
              </div>
            )}
          </section>
        )}

        {/* خطوة 3 */}
        {step === 3 && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
            <div className={`relative backdrop-blur-xl border rounded-2xl p-8 shadow-2xl ${
              dark ? "bg-white/10 border-white/20" : "bg-black/10 border-gray-300/30"
            }`}>
              {/* History Icon - Left corner */}
              {historyMatches.length > 0 && (
                <div 
                  ref={historyIconRef}
                  className={`absolute -top-3 -left-3 z-10 w-10 h-10 rounded-full border-2 shadow-lg cursor-pointer transition-all duration-300 hover:scale-110 ${
                    showHistoryBox 
                      ? dark 
                        ? "border-cyan-400 bg-cyan-700/70 shadow-cyan-400/50" 
                        : "border-cyan-500 bg-cyan-300/70 shadow-cyan-400/50"
                      : dark 
                        ? "border-cyan-400/50 bg-cyan-700/30 hover:bg-cyan-700/50" 
                        : "border-cyan-400/50 bg-cyan-200/30 hover:bg-cyan-200/50"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHistoryIconClick(e);
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Clock className={`w-5 h-5 transition-colors ${
                      showHistoryBox 
                        ? dark ? "text-cyan-100" : "text-cyan-800"
                        : dark ? "text-cyan-300" : "text-cyan-700"
                    }`} />
                  </div>
                  {/* Notification dot */}
                  <div className={`absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full border border-white ${
                    showHistoryBox ? "animate-none" : "animate-pulse"
                  }`}></div>
                </div>
              )}

              {/* Player Avatar - Right corner (original position) */}
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
              {/* History Icon - Left corner */}
              {historyMatches.length > 0 && (
                <div 
                  className={`absolute -top-3 -left-3 z-10 w-10 h-10 rounded-full border-2 shadow-lg cursor-pointer transition-all duration-300 hover:scale-110 ${
                    showHistoryBox 
                      ? dark 
                        ? "border-cyan-400 bg-cyan-700/70 shadow-cyan-400/50" 
                        : "border-cyan-500 bg-cyan-300/70 shadow-cyan-400/50"
                      : dark 
                        ? "border-cyan-400/50 bg-cyan-700/30 hover:bg-cyan-700/50" 
                        : "border-cyan-400/50 bg-cyan-200/30 hover:bg-cyan-200/50"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHistoryIconClick(e);
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Clock className={`w-5 h-5 transition-colors ${
                      showHistoryBox 
                        ? dark ? "text-cyan-100" : "text-cyan-800"
                        : dark ? "text-cyan-300" : "text-cyan-700"
                    }`} />
                  </div>
                  {/* Notification dot */}
                  <div className={`absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full border border-white ${
                    showHistoryBox ? "animate-none" : "animate-pulse"
                  }`}></div>
                </div>
              )}

              {/* Player Avatar - Right corner (original position) */}
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
                  {/* Partner Timer Notifications */}
                  {showPartnerStartedNotification && (
                    <div className={`mb-4 p-3 rounded-xl border-2 animate-in slide-in-from-top-4 duration-500 ${
                      dark
                        ? "bg-green-500/20 border-green-400/40 text-green-200"
                        : "bg-green-100/50 border-green-400/40 text-green-700"
                    }`}>
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span className="font-semibold">شريكك بدأ الحوار! جاري بدء المؤقت...</span>
                      </div>
                    </div>
                  )}
                  
                  {partnerEndedTimer && (
                    <div className={`mb-4 p-3 rounded-xl border-2 animate-in slide-in-from-top-4 duration-500 ${
                      dark 
                        ? "bg-orange-500/20 border-orange-400/40 text-orange-200" 
                        : "bg-orange-100/50 border-orange-400/40 text-orange-700"
                    }`}>
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
                        <span className="font-semibold">شريكك أنهى الحوار! جاري الانتقال للتقييم...</span>
                      </div>
                    </div>
                  )}
                  
                  <h3 className={`text-xl font-bold text-center mb-4 ${
                    dark ? "text-slate-200" : "text-gray-800"
                  }`}>
                    {matchResult === "المنظم" ? "حوار مع المنظم" : `حوار مع رقم ${matchResult}`}
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

                  <div className="flex justify-center mb-6">
                    <button
                      onClick={() => setShowPromptTopicsModal(true)}
                      className={`flex items-center gap-2 px-6 py-3 rounded-2xl shadow-lg font-bold text-lg transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 ${
                        dark
                          ? "bg-gradient-to-r from-cyan-700 to-blue-700 text-white border-2 border-cyan-400/30 hover:bg-cyan-800"
                          : "bg-gradient-to-r from-cyan-200 to-blue-200 text-blue-900 border-2 border-cyan-400/30 hover:bg-cyan-100"
                      } animate-in slide-in-from-bottom-4`}
                      style={{ boxShadow: dark ? '0 4px 24px 0 #22d3ee33' : '0 4px 24px 0 #06b6d433' }}
                      aria-label="أسئلة للنقاش"
                    >
                      <Sparkles className="w-6 h-6 animate-pulse" />
                      أسئلة للنقاش
                    </button>
                  </div>

                  {/* AI Questions Generator */}
                  {secureToken && (
                    <div className="mb-6">
                      <AIQuestionsGenerator 
                        secureToken={secureToken}
                        dark={dark}
                        currentRound={currentRound}
                      />
                    </div>
                  )}

                  <div className={`text-center mb-6 p-4 rounded-xl border ${
                    dark 
                      ? "bg-slate-700/30 border-slate-600" 
                      : "bg-blue-50 border-blue-200"
                  }`}>
                    <p className={`text-lg ${dark ? "text-slate-300" : "text-gray-700"}`}>
                      انتظر بدء المنظم للمؤقت
                    </p>
                    <p className={`text-sm mt-2 ${dark ? "text-slate-400" : "text-gray-500"}`}>
                      سيبدأ المؤقت تلقائياً لجميع المشاركين في نفس الوقت
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <h3 className={`text-xl font-bold text-center mb-4 ${
                    dark ? "text-slate-200" : "text-gray-800"
                  }`}>
                    {matchResult === "المنظم" ? "حوار مع المنظم" : `حوار مع رقم ${matchResult}`}
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

                  <div className="flex justify-center mb-6">
                    <button
                      onClick={() => setShowPromptTopicsModal(true)}
                      className={`flex items-center gap-2 px-6 py-3 rounded-2xl shadow-lg font-bold text-lg transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 ${
                        dark
                          ? "bg-gradient-to-r from-cyan-700 to-blue-700 text-white border-2 border-cyan-400/30 hover:bg-cyan-800"
                          : "bg-gradient-to-r from-cyan-200 to-blue-200 text-blue-900 border-2 border-cyan-400/30 hover:bg-cyan-100"
                      } animate-in slide-in-from-bottom-4`}
                      style={{ boxShadow: dark ? '0 4px 24px 0 #22d3ee33' : '0 4px 24px 0 #06b6d433' }}
                      aria-label="أسئلة للنقاش"
                    >
                      <Sparkles className="w-6 h-6 animate-pulse" />
                      أسئلة للنقاش
                    </button>
                  </div>

                  {/* AI Questions Generator */}
                  {secureToken && (
                    <div className="mb-6">
                      <AIQuestionsGenerator 
                        secureToken={secureToken}
                        dark={dark}
                        currentRound={currentRound}
                      />
                    </div>
                  )}

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

                  <div className={`text-center mb-6 p-4 rounded-xl border ${
                    dark 
                      ? "bg-slate-700/30 border-slate-600" 
                      : "bg-orange-50 border-orange-200"
                  }`}>
                    <p className={`text-lg ${dark ? "text-slate-300" : "text-gray-700"}`}>
                      انتظر إنهاء المنظم للمؤقت
                    </p>
                    <p className={`text-sm mt-2 ${dark ? "text-slate-400" : "text-gray-500"}`}>
                      سينتهي المؤقت تلقائياً لجميع المشاركين في نفس الوقت
                    </p>
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
              {/* History Icon - Left corner */}
              {historyMatches.length > 0 && (
                <div 
                  className={`absolute -top-3 -left-3 z-10 w-10 h-10 rounded-full border-2 shadow-lg cursor-pointer transition-all duration-300 hover:scale-110 ${
                    showHistoryBox 
                      ? dark 
                        ? "border-cyan-400 bg-cyan-700/70 shadow-cyan-400/50" 
                        : "border-cyan-500 bg-cyan-300/70 shadow-cyan-400/50"
                      : dark 
                        ? "border-cyan-400/50 bg-cyan-700/30 hover:bg-cyan-700/50" 
                        : "border-cyan-400/50 bg-cyan-200/30 hover:bg-cyan-200/50"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHistoryIconClick(e);
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Clock className={`w-5 h-5 transition-colors ${
                      showHistoryBox 
                        ? dark ? "text-cyan-100" : "text-cyan-800"
                        : dark ? "text-cyan-300" : "text-cyan-700"
                    }`} />
                  </div>
                  {/* Notification dot */}
                  <div className={`absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full border border-white ${
                    showHistoryBox ? "animate-none" : "animate-pulse"
                  }`}></div>
                </div>
              )}

              {/* Player Avatar - Right corner (original position) */}
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
                بانتظار المنظّم لبدء الجولة {currentRound + 1}...
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

              {/* AI Questions Generator */}
              {secureToken && (
                <div className="mt-6">
                  <AIQuestionsGenerator 
                    secureToken={secureToken}
                    dark={dark}
                    currentRound={currentRound}
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {step === 6 && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
            <div className={`relative backdrop-blur-xl border rounded-2xl p-8 shadow-2xl ${
              dark ? "bg-white/10 border-white/20" : "bg-black/10 border-gray-300/30"
            }`}>
              {/* History Icon - Left corner */}
              {historyMatches.length > 0 && (
                <div 
                  className={`absolute -top-3 -left-3 z-10 w-10 h-10 rounded-full border-2 shadow-lg cursor-pointer transition-all duration-300 hover:scale-110 ${
                    showHistoryBox 
                      ? dark 
                        ? "border-cyan-400 bg-cyan-700/70 shadow-cyan-400/50" 
                        : "border-cyan-500 bg-cyan-300/70 shadow-cyan-400/50"
                      : dark 
                        ? "border-cyan-400/50 bg-cyan-700/30 hover:bg-cyan-700/50" 
                        : "border-cyan-400/50 bg-cyan-200/30 hover:bg-cyan-200/50"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHistoryIconClick(e);
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Clock className={`w-5 h-5 transition-colors ${
                      showHistoryBox 
                        ? dark ? "text-cyan-100" : "text-cyan-800"
                        : dark ? "text-cyan-300" : "text-cyan-700"
                    }`} />
                  </div>
                  {/* Notification dot */}
                  <div className={`absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full border border-white ${
                    showHistoryBox ? "animate-none" : "animate-pulse"
                  }`}></div>
                </div>
              )}

              {/* Player Avatar - Right corner (original position) */}
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
              
              {!conversationStarted || conversationTimer <= 0 ? (
                // Show this block if conversation has NOT started or timer expired
                <>
                  <h3 className={`text-xl font-bold text-center mb-4 ${
                    dark ? "text-slate-200" : "text-gray-800"
                  }`}>
                    توأم روحك في الجولة {currentRound} هو رقم {matchResult}
                  </h3>
                  
                  <div className={`text-center mb-6 p-4 rounded-xl border ${
                    dark 
                      ? "bg-slate-700/30 border-slate-600" 
                      : "bg-blue-50 border-blue-200"
                  }`}>
                    <p className={`text-lg ${dark ? "text-slate-300" : "text-gray-700"}`}>
                      انتظر بدء المنظم للمؤقت
                    </p>
                    <p className={`text-sm mt-2 ${dark ? "text-slate-400" : "text-gray-500"}`}>
                      سيبدأ المؤقت تلقائياً لجميع المشاركين في نفس الوقت
                    </p>
                  </div>
                </>
              ) : (
                // Show this block if conversation has started and timer is running
                <>
                  <h3 className={`text-xl font-bold text-center mb-4 ${
                    dark ? "text-slate-200" : "text-gray-800"
                  }`}>
                    {matchResult === "المنظم" ? `حوار مع المنظم (الجولة ${currentRound})` : `حوار مع رقم ${matchResult} (الجولة ${currentRound})`}
                  </h3>
                  // ... existing code ...
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
                  <div className={`text-center mb-6 p-4 rounded-xl border ${
                    dark 
                      ? "bg-slate-700/30 border-slate-600" 
                      : "bg-orange-50 border-orange-200"
                  }`}>
                    <p className={`text-lg ${dark ? "text-slate-300" : "text-gray-700"}`}>
                      انتظر إنهاء المنظم للمؤقت
                    </p>
                    <p className={`text-sm mt-2 ${dark ? "text-slate-400" : "text-gray-500"}`}>
                      سينتهي المؤقت تلقائياً لجميع المشاركين في نفس الوقت
                    </p>
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
              {/* Player Avatar - Right corner */}
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

              <div className="flex justify-center mb-6">
                <div className="relative">
                  <Users className={`w-16 h-16 ${
                    dark ? "text-orange-400" : "text-orange-600"
                  } animate-pulse`} />
                  {/* Removed compatibility score overlay for groups as it shows incorrect pair data */}
                </div>
              </div>
              
              {!conversationStarted ? (
                <>
                  <h3 className={`text-2xl font-bold text-center mb-4 ${
                    dark ? "text-orange-200" : "text-orange-800"
                  }`}>
                    المرحلة الجماعية
                  </h3>

                  <div className={`text-center mb-6 p-4 rounded-xl border ${
                    dark 
                      ? "bg-gradient-to-r from-orange-500/20 to-amber-500/20 border-orange-400/30"
                      : "bg-gradient-to-r from-orange-200/50 to-amber-200/50 border-orange-400/30"
                  }`}>
                    <h4 className={`text-lg font-semibold mb-2 ${
                      dark ? "text-orange-200" : "text-orange-800"
                    }`}>
                      أعضاء مجموعتك ({matchResult ? matchResult.split(" ، ").length : 0} أشخاص)
                    </h4>
                    <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                      {matchResult && matchResult.split(" ، ").map((participant: string, index: number) => (
                        <div
                          key={index}
                          className={`px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 hover:scale-105 ${
                            parseInt(participant) === assignedNumber
                              ? dark 
                                ? "bg-orange-600 text-white border-2 border-orange-400 shadow-lg animate-pulse" 
                                : "bg-orange-600 text-white border-2 border-orange-500 shadow-lg animate-pulse"
                              : dark
                                ? "bg-orange-500/30 text-orange-200 border border-orange-400/50 hover:bg-orange-500/40"
                                : "bg-orange-200/70 text-orange-800 border border-orange-400/50 hover:bg-orange-200/90"
                          }`}
                        >
                          #{participant}
                          {parseInt(participant) === assignedNumber && " (أنت)"}
                        </div>
                      ))}
                    </div>
                    {/* Group size indicator */}
                    <div className={`mt-3 text-xs ${
                      dark ? "text-orange-300" : "text-orange-700"
                    }`}>
                      {matchResult && (() => {
                        const groupSize = matchResult.split(" ، ").length;
                        if (groupSize <= 3) return "مجموعة صغيرة";
                        if (groupSize === 4) return "مجموعة متوسطة";
                        if (groupSize >= 5) return "مجموعة كبيرة";
                        return "";
                      })()}
                    </div>
                  </div>

                  <div className={`text-center mb-6 p-3 rounded-xl border ${
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

                  {/* Group Conversation Tips */}
                  <div className={`mb-6 p-4 rounded-xl border ${
                    dark 
                      ? "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-400/30"
                      : "bg-gradient-to-r from-blue-200/50 to-cyan-200/50 border-blue-400/30"
                  }`}>
                    <h4 className={`text-lg font-bold text-center mb-3 ${dark ? "text-blue-200" : "text-blue-800"}`}>نصائح للحوار الجماعي</h4>
                    <div className="space-y-2">
                      <div className={`flex items-start gap-2 text-sm ${dark ? "text-blue-200" : "text-blue-700"}`}>
                        <span>•</span>
                        <span>تأكد من إشراك جميع أعضاء المجموعة في الحوار</span>
                      </div>
                      <div className={`flex items-start gap-2 text-sm ${dark ? "text-blue-200" : "text-blue-700"}`}>
                        <span>•</span>
                        <span>استمع بعناية لآراء الجميع قبل المشاركة</span>
                      </div>
                      <div className={`flex items-start gap-2 text-sm ${dark ? "text-blue-200" : "text-blue-700"}`}>
                        <span>•</span>
                        <span>ابحث عن نقاط التشابه والاختلاف بينكم</span>
                      </div>
                      <div className={`flex items-start gap-2 text-sm ${dark ? "text-blue-200" : "text-blue-700"}`}>
                        <span>•</span>
                        <span>كن مفتوحاً لتجارب وخبرات مختلفة</span>
                      </div>
                    </div>
                  </div>

                  {/* Simple Group Conversation Starters */}
                  {/* Comprehensive Questions Button for Group Phase */}
                  <div className="flex justify-center mb-6">
                        <button
                      onClick={() => setShowPromptTopicsModal(true)}
                      className={`flex items-center gap-2 px-6 py-3 rounded-2xl shadow-lg font-bold text-lg transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 ${
                        dark
                          ? "bg-gradient-to-r from-orange-700 to-amber-700 text-white border-2 border-orange-400/30 hover:bg-orange-800"
                          : "bg-gradient-to-r from-orange-200 to-amber-200 text-orange-900 border-2 border-orange-400/30 hover:bg-orange-100"
                      } animate-in slide-in-from-bottom-4`}
                      style={{ boxShadow: dark ? '0 4px 24px 0 #fb923c33' : '0 4px 24px 0 #f97316aa' }}
                      aria-label="أسئلة شاملة للنقاش الجماعي"
                        >
                      <Sparkles className="w-6 h-6 animate-pulse" />
                      أسئلة شاملة للنقاش
                        </button>
                  </div>

                  <div className={`text-center mb-6 p-4 rounded-xl border ${
                    dark 
                      ? "bg-slate-700/30 border-slate-600" 
                      : "bg-blue-50 border-blue-200"
                  }`}>
                    <p className={`text-lg ${dark ? "text-slate-300" : "text-gray-700"}`}>
                      انتظر بدء المنظم للمؤقت الجماعي
                    </p>
                    <p className={`text-sm mt-2 ${dark ? "text-slate-400" : "text-gray-500"}`}>
                      سيبدأ المؤقت تلقائياً لجميع المشاركين في نفس الوقت
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <h3 className={`text-xl font-bold text-center mb-4 ${
                    dark ? "text-orange-200" : "text-orange-800"
                  }`}>
                    حوار جماعي مع مجموعتك
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
                      }`}>الوقت المتبقي للحوار الجماعي:</span>
                    </div>
                    <p className={`text-3xl font-bold ${
                      dark ? "text-orange-200" : "text-orange-800"
                    }`}>
                      {formatTime(conversationTimer)}
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <div className={`text-center mb-6 p-4 rounded-xl border ${
                      dark 
                        ? "bg-slate-700/30 border-slate-600" 
                        : "bg-orange-50 border-orange-200"
                    }`}>
                      <p className={`text-lg ${dark ? "text-slate-300" : "text-gray-700"}`}>
                        انتظر إنهاء المنظم للمؤقت الجماعي
                      </p>
                      <p className={`text-sm mt-2 ${dark ? "text-slate-400" : "text-gray-500"}`}>
                        سينتهي المؤقت تلقائياً لجميع المشاركين في نفس الوقت
                      </p>
                    </div>
                  </div>
                </>
              )}
    </div>
  </section>
        )}

        {/* Main feedback/result + previous matches layout */}
        {modalStep && (
          <div ref={feedbackRef} className="flex flex-col md:flex-row gap-6 w-full max-w-4xl mx-auto mt-12">
            {/* Main Content */}
            <div className="flex-1 min-w-0">
              {modalStep === "feedback" ? (
                <>
                  <h3 className={`text-xl font-bold text-center mb-6 ${dark ? "text-slate-200" : "text-gray-800"}`}>تقييم المحادثة</h3>
                  <div className="space-y-6">
                    {/* Compatibility Rate Slider */}
                    <div>
                                            <label className={`block text-sm font-medium mb-1 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                        درجة التوافق مع شريك المحادثة
                      </label>
                      <p className={`text-xs font-normal opacity-60 mb-3 ${dark ? "text-slate-400" : "text-gray-500"}`}>
                        (بعد التقييم سوف يظهر التقييم الحقيقي)
                      </p>
                      <div className="relative">
                        <div className="relative group">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={100 - feedbackAnswers.compatibilityRate}
                            onChange={(e) => setFeedbackAnswers(prev => ({ ...prev, compatibilityRate: 100 - parseInt(e.target.value) }))}
                            className="w-full h-2 rounded-full appearance-none cursor-pointer focus:outline-none transition-all duration-300 
                              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
                              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white 
                              [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 
                              [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-all 
                              [&::-webkit-slider-thumb]:duration-200 hover:[&::-webkit-slider-thumb]:scale-110 
                              hover:[&::-webkit-slider-thumb]:shadow-xl [&::-webkit-slider-thumb]:border-solid
                              [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full 
                              [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:cursor-pointer"
                            style={{
                              background: `linear-gradient(to right, 
                                ${feedbackAnswers.compatibilityRate >= 80 ? '#059669' : 
                                  feedbackAnswers.compatibilityRate >= 60 ? '#d97706' : '#dc2626'} 0%, 
                                ${feedbackAnswers.compatibilityRate >= 80 ? '#10b981' : 
                                  feedbackAnswers.compatibilityRate >= 60 ? '#f59e0b' : '#ef4444'} ${Math.max(feedbackAnswers.compatibilityRate - 2, 0)}%, 
                                ${feedbackAnswers.compatibilityRate >= 80 ? '#34d399' : 
                                  feedbackAnswers.compatibilityRate >= 60 ? '#fbbf24' : '#f87171'} ${feedbackAnswers.compatibilityRate}%, 
                                ${dark ? '#475569' : '#cbd5e1'} ${Math.min(feedbackAnswers.compatibilityRate + 2, 100)}%, 
                                ${dark ? '#334155' : '#e2e8f0'} 100%)`,
                              boxShadow: `inset 0 1px 2px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.1)`,
                              '--thumb-color': feedbackAnswers.compatibilityRate >= 80 ? '#10b981' : 
                                feedbackAnswers.compatibilityRate >= 60 ? '#f59e0b' : '#ef4444'
                            } as React.CSSProperties & { '--thumb-color': string }}
                          />
                          <style>
                            {`
                              input[type="range"]::-webkit-slider-thumb {
                                border-color: ${feedbackAnswers.compatibilityRate >= 80 ? '#10b981' : 
                                  feedbackAnswers.compatibilityRate >= 60 ? '#f59e0b' : '#ef4444'} !important;
                              }
                              input[type="range"]::-moz-range-thumb {
                                border-color: ${feedbackAnswers.compatibilityRate >= 80 ? '#10b981' : 
                                  feedbackAnswers.compatibilityRate >= 60 ? '#f59e0b' : '#ef4444'} !important;
                              }
                            `}
                          </style>
                        </div>
                        <div className="flex justify-between text-xs mt-2" dir="ltr">
                          <span className={`${dark ? "text-slate-400" : "text-gray-500"}`}>0%</span>
                          <span className={`font-bold text-lg ${
                            feedbackAnswers.compatibilityRate >= 80 ? "text-green-500" :
                            feedbackAnswers.compatibilityRate >= 60 ? "text-yellow-500" :
                            "text-red-500"
                          }`}>
                            {feedbackAnswers.compatibilityRate}%
                          </span>
                          <span className={`${dark ? "text-slate-400" : "text-gray-500"}`}>100%</span>
                        </div>
                      </div>
                    </div>

                                        {/* Conversation Quality Scale */}
                     <div>
                       <label className={`block text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         جودة المحادثة <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = ضعيف جداً، 5 = ممتاز)</span>
                       </label>
                       <div className="flex items-center justify-between gap-2" dir="ltr">
                         {[1, 2, 3, 4, 5].map((value) => {
                           const getColor = (v: number) => {
                             if (v === 1) return "bg-red-500 border-red-500"
                             if (v === 2) return "bg-orange-500 border-orange-500"
                             if (v === 3) return "bg-yellow-500 border-yellow-500"
                             if (v === 4) return "bg-lime-500 border-lime-500"
                             if (v === 5) return "bg-green-500 border-green-500"
                             return ""
                           }
                           return (
                             <button
                               key={value}
                               onClick={() => setFeedbackAnswers(prev => ({ ...prev, conversationQuality: value }))}
                               className={`w-12 h-12 rounded-xl border-2 transition-all duration-300 transform hover:scale-110 text-lg font-bold ${
                                 feedbackAnswers.conversationQuality === value
                                   ? `${getColor(value)} text-white shadow-lg`
                                   : dark
                                     ? "border-slate-400/30 bg-white/10 text-slate-200 hover:bg-white/20"
                                     : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                               }`}
                             >
                               {value}
                             </button>
                           )
                         })}
                       </div>
                     </div>

                     {/* Personal Connection Scale */}
                     <div>
                       <label className={`block text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         القيم المشتركة <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = لا يوجد، 5 = قوي جداً)</span>
                       </label>
                       <div className="flex items-center justify-between gap-2" dir="ltr">
                         {[1, 2, 3, 4, 5].map((value) => {
                           const getColor = (v: number) => {
                             if (v === 1) return "bg-red-500 border-red-500"
                             if (v === 2) return "bg-orange-500 border-orange-500"
                             if (v === 3) return "bg-yellow-500 border-yellow-500"
                             if (v === 4) return "bg-lime-500 border-lime-500"
                             if (v === 5) return "bg-green-500 border-green-500"
                             return ""
                           }
                           return (
                             <button
                               key={value}
                               onClick={() => setFeedbackAnswers(prev => ({ ...prev, personalConnection: value }))}
                               className={`w-12 h-12 rounded-xl border-2 transition-all duration-300 transform hover:scale-110 text-lg font-bold ${
                                 feedbackAnswers.personalConnection === value
                                   ? `${getColor(value)} text-white shadow-lg`
                                   : dark
                                     ? "border-slate-400/30 bg-white/10 text-slate-200 hover:bg-white/20"
                                     : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                               }`}
                             >
                               {value}
                             </button>
                           )
                         })}
                       </div>
                     </div>

                     {/* Shared Interests Scale */}
                     <div>
                       <label className={`block text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         الاهتمامات المشتركة <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = لا يوجد، 5 = كثيرة جداً)</span>
                       </label>
                       <div className="flex items-center justify-between gap-2" dir="ltr">
                         {[1, 2, 3, 4, 5].map((value) => {
                           const getColor = (v: number) => {
                             if (v === 1) return "bg-red-500 border-red-500"
                             if (v === 2) return "bg-orange-500 border-orange-500"
                             if (v === 3) return "bg-yellow-500 border-yellow-500"
                             if (v === 4) return "bg-lime-500 border-lime-500"
                             if (v === 5) return "bg-green-500 border-green-500"
                             return ""
                           }
                           return (
                             <button
                               key={value}
                               onClick={() => setFeedbackAnswers(prev => ({ ...prev, sharedInterests: value }))}
                               className={`w-12 h-12 rounded-xl border-2 transition-all duration-300 transform hover:scale-110 text-lg font-bold ${
                                 feedbackAnswers.sharedInterests === value
                                   ? `${getColor(value)} text-white shadow-lg`
                                   : dark
                                     ? "border-slate-400/30 bg-white/10 text-slate-200 hover:bg-white/20"
                                     : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                               }`}
                             >
                               {value}
                             </button>
                           )
                         })}
                       </div>
                     </div>

                     {/* Comfort Level Scale */}
                     <div>
                       <label className={`block text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         مستوى الراحة <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = غير مرتاح، 5 = مرتاح جداً)</span>
                       </label>
                       <div className="flex items-center justify-between gap-2" dir="ltr">
                         {[1, 2, 3, 4, 5].map((value) => {
                           const getColor = (v: number) => {
                             if (v === 1) return "bg-red-500 border-red-500"
                             if (v === 2) return "bg-orange-500 border-orange-500"
                             if (v === 3) return "bg-yellow-500 border-yellow-500"
                             if (v === 4) return "bg-lime-500 border-lime-500"
                             if (v === 5) return "bg-green-500 border-green-500"
                             return ""
                           }
                           return (
                             <button
                               key={value}
                               onClick={() => setFeedbackAnswers(prev => ({ ...prev, comfortLevel: value }))}
                               className={`w-12 h-12 rounded-xl border-2 transition-all duration-300 transform hover:scale-110 text-lg font-bold ${
                                 feedbackAnswers.comfortLevel === value
                                   ? `${getColor(value)} text-white shadow-lg`
                                   : dark
                                     ? "border-slate-400/30 bg-white/10 text-slate-200 hover:bg-white/20"
                                     : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                               }`}
                             >
                               {value}
                             </button>
                           )
                         })}
                       </div>
                     </div>

                     {/* Communication Style Match */}
                     <div>
                       <label className={`block text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         توافق أسلوب التواصل <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = مختلف جداً، 5 = متطابق تماماً)</span>
                       </label>
                       <div className="flex items-center justify-between gap-2" dir="ltr">
                         {[1, 2, 3, 4, 5].map((value) => {
                           const getColor = (v: number) => {
                             if (v === 1) return "bg-red-500 border-red-500"
                             if (v === 2) return "bg-orange-500 border-orange-500"
                             if (v === 3) return "bg-yellow-500 border-yellow-500"
                             if (v === 4) return "bg-lime-500 border-lime-500"
                             if (v === 5) return "bg-green-500 border-green-500"
                             return ""
                           }
                           return (
                             <button
                               key={value}
                               onClick={() => setFeedbackAnswers(prev => ({ ...prev, communicationStyle: value }))}
                               className={`w-12 h-12 rounded-xl border-2 transition-all duration-300 transform hover:scale-110 text-lg font-bold ${
                                 feedbackAnswers.communicationStyle === value
                                   ? `${getColor(value)} text-white shadow-lg`
                                   : dark
                                     ? "border-slate-400/30 bg-white/10 text-slate-200 hover:bg-white/20"
                                     : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                               }`}
                             >
                               {value}
                             </button>
                           )
                         })}
                       </div>
                     </div>

                     {/* Would Meet Again Scale */}
                     <div>
                       <label className={`block text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         الرغبة في مقابلة مرة أخرى <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = أبداً، 5 = بالتأكيد)</span>
                       </label>
                       <div className="flex items-center justify-between gap-2" dir="ltr">
                         {[1, 2, 3, 4, 5].map((value) => {
                           const getColor = (v: number) => {
                             if (v === 1) return "bg-red-500 border-red-500"
                             if (v === 2) return "bg-orange-500 border-orange-500"
                             if (v === 3) return "bg-yellow-500 border-yellow-500"
                             if (v === 4) return "bg-lime-500 border-lime-500"
                             if (v === 5) return "bg-green-500 border-green-500"
                             return ""
                           }
                           return (
                             <button
                               key={value}
                               onClick={() => setFeedbackAnswers(prev => ({ ...prev, wouldMeetAgain: value }))}
                               className={`w-12 h-12 rounded-xl border-2 transition-all duration-300 transform hover:scale-110 text-lg font-bold ${
                                 feedbackAnswers.wouldMeetAgain === value
                                   ? `${getColor(value)} text-white shadow-lg`
                                   : dark
                                     ? "border-slate-400/30 bg-white/10 text-slate-200 hover:bg-white/20"
                                     : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                               }`}
                             >
                               {value}
                             </button>
                           )
                         })}
                       </div>
                     </div>

                     {/* Overall Experience Scale */}
                     <div>
                       <label className={`block text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         التقييم العام للتجربة <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = سيء، 5 = ممتاز)</span>
                       </label>
                       <div className="flex items-center justify-between gap-2" dir="ltr">
                         {[1, 2, 3, 4, 5].map((value) => {
                           const getColor = (v: number) => {
                             if (v === 1) return "bg-red-500 border-red-500"
                             if (v === 2) return "bg-orange-500 border-orange-500"
                             if (v === 3) return "bg-yellow-500 border-yellow-500"
                             if (v === 4) return "bg-lime-500 border-lime-500"
                             if (v === 5) return "bg-green-500 border-green-500"
                             return ""
                           }
                           return (
                             <button
                               key={value}
                               onClick={() => setFeedbackAnswers(prev => ({ ...prev, overallExperience: value }))}
                               className={`w-12 h-12 rounded-xl border-2 transition-all duration-300 transform hover:scale-110 text-lg font-bold ${
                                 feedbackAnswers.overallExperience === value
                                   ? `${getColor(value)} text-white shadow-lg`
                                   : dark
                                     ? "border-slate-400/30 bg-white/10 text-slate-200 hover:bg-white/20"
                                     : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                               }`}
                             >
                               {value}
                             </button>
                           )
                         })}
                       </div>
                     </div>

                                         {/* Optional Recommendations */}
                     <div>
                       <label className={`block text-sm font-medium mb-2 flex items-center gap-2 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         <FileText className="w-4 h-4" />
                         توصيات أو نصائح (اختياري)
                       </label>
                      <textarea
                        value={feedbackAnswers.recommendations}
                        onChange={(e) => setFeedbackAnswers(prev => ({ ...prev, recommendations: e.target.value }))}
                        placeholder="شاركنا أي توصيات أو نصائح لتحسين تجربة المحادثة..."
                        rows={3}
                        className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 resize-none ${
                          dark 
                            ? "border-slate-400/30 bg-white/10 text-white focus:ring-slate-400/30 focus:border-slate-400 placeholder-slate-400" 
                            : "border-blue-400/30 bg-white/90 text-gray-800 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm placeholder-gray-500"
                        }`}
                      />
                    </div>
                  </div>

                                     <div className="flex justify-center gap-3 mt-8">
                     <Button
                       onClick={submitFeedback}
                       className="spring-btn bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105 px-8 py-3 flex items-center gap-2"
                     >
                       <Send className="w-4 h-4" />
                       إرسال التقييم
                     </Button>
                   </div>
                </>
              ) : (
                <>
                  <h3 className={`text-xl font-bold text-center mb-6 ${dark ? "text-slate-200" : "text-gray-800"}`}>شكراً لك!</h3>
                                      <div className={`text-center mb-6 p-6 rounded-xl border ${dark ? "bg-gradient-to-r from-slate-500/20 to-slate-600/20 border-slate-400/30" : "bg-gradient-to-r from-gray-200/50 to-gray-300/50 border-gray-400/30"}`}>
                      <div className="flex justify-center my-4">
                        <CircularProgressBar
                          progress={compatibilityScore !== null ? Math.round(compatibilityScore) : 0}
                          size={180}
                          strokeWidth={20}
                          dark={dark}
                        />
                      </div>
                      {isScoreRevealed && (
                        <div className="mt-4">
                          {/* New formatted compatibility reason */}
                          {(() => {
                            const formattedReason = formatCompatibilityReason(matchReason)
                            return (
                              <div className="space-y-3">
                                <h4 className={`text-lg font-bold ${dark ? "text-slate-200" : "text-gray-800"}`}>تحليل التوافق</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {formattedReason.components.map((component: { name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }, index: number) => (
                                    <div 
                                      key={index}
                                      className={`p-3 rounded-lg border ${component.bgColor} ${component.borderColor} backdrop-blur-sm`}
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <span className={`text-sm font-semibold ${dark ? "text-slate-200" : "text-gray-800"}`}>
                                          {component.name}
                                        </span>
                                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${component.color} ${component.bgColor}`}>
                                          {component.strength}
                                        </span>
                                      </div>
                                      <p className={`text-xs ${dark ? "text-slate-300" : "text-gray-600"}`}>
                                        {component.description}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })()}
                        {isRepeatMatch && (
                          <div className={`mt-4 p-4 rounded-xl border-2 ${dark ? "bg-amber-500/20 border-amber-400/40" : "bg-amber-100/50 border-amber-300/40"}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle className={`w-5 h-5 ${dark ? "text-amber-300" : "text-amber-600"}`} />
                              <span className={`font-bold ${dark ? "text-amber-200" : "text-amber-700"}`}>تكرار المقابلة</span>
                            </div>
                            <p className={`text-sm ${dark ? "text-amber-100" : "text-amber-800"}`}>
                              تم إعادة مباراتك مع شريك سابق لأن جميع المشاركين الآخرين كانوا مشغولين. يمكنك أخذ استراحة أو إعادة الجلوس مع نفس الشريك.
                            </p>
                          </div>
                        )}
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
                  setFormFilledChoiceMade(true);
                  setStep(2); // Stay on form
                  setAnalysisStarted(false);
                  setShowSurvey(true); // Show survey for redo
                }}
              >
                إعادة تعبئة النموذج
              </Button>
              <Button
                className="px-6 py-2 font-bold"
                variant="outline"
                onClick={() => {
                  setShowFormFilledPrompt(false);
                  setFormFilledChoiceMade(true);
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
                      try {
                        setSelectedHistoryItem(m)
                        setShowHistoryDetail(true)
                      } catch (error) {
                        console.error("Error opening history detail:", error)
                        setShowHistoryDetail(false)
                        setSelectedHistoryItem(null)
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-lg ${dark ? "text-blue-200" : "text-blue-700"}`}>{m.with === "المنظم" ? "المنظم" : `#${m.with}`}</span>
                      <span className={`text-xs px-2 py-1 rounded ${dark ? "bg-slate-700 text-slate-200" : "bg-blue-100 text-blue-700"}`}>الجولة {m.round}</span>
                      {m.is_repeat_match && (
                        <span className={`text-xs px-2 py-1 rounded ${dark ? "bg-amber-600/70 text-amber-200" : "bg-amber-200/70 text-amber-700"}`}>
                          <AlertTriangle className="w-3 h-3 inline mr-1" />
                          تكرار
                        </span>
                      )}
                      <span className={`ml-auto font-bold ${dark ? "text-cyan-300" : "text-cyan-700"}`}>
                        {m.with && typeof m.with === 'string' && m.with.includes("،") ? `${Math.round((m.score || 0) * 10)}%` : `${m.score || 0}%`}
                      </span>
                    </div>
                    <div className={`text-sm italic ${dark ? "text-slate-300" : "text-gray-600"}`}>{m.reason || "لا يوجد سبب محدد"}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}



              {/* Floating History Box */}
        {showHistoryBox && historyMatches.length > 0 && (
          <div
            ref={historyBoxRef}
            className={`fixed z-50 pointer-events-auto ${isDragging ? 'cursor-grabbing' : ''}`}
            style={{
              left: `${historyBoxPosition.x}px`,
              top: `${historyBoxPosition.y}px`,
            }}
          >
            <div className={`w-60 rounded-2xl shadow-2xl border-2 backdrop-blur-xl transition-all duration-300 transform animate-in fade-in slide-in-from-bottom-2 ${
              dark 
                ? "bg-slate-800/95 border-slate-600/50 shadow-black/50" 
                : "bg-white/95 border-gray-200/50 shadow-gray-900/20"
            }`}>
              {/* Draggable Header */}
              <div 
                className={`flex items-center justify-between p-4 pb-2 cursor-grab active:cursor-grabbing ${
                  dark ? "text-cyan-200" : "text-cyan-700"
                }`}
                onMouseDown={handleMouseDown}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" /> 
                  <h4 className="text-base font-bold">اللقاءات السابقة</h4>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowHistoryBox(false);
                  }}
                  className={`p-1 rounded-full hover:bg-black/10 transition-colors ${
                    dark ? "hover:bg-white/10" : "hover:bg-black/10"
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              {/* Content */}
              <div className="px-4 pb-4">
                <div className="space-y-2">
                  {historyMatches.map((m: MatchResultEntry, i: number) => (
                    <div 
                      key={i} 
                      className={`flex items-center justify-between text-sm rounded-lg px-3 py-2 cursor-pointer transition-all duration-200 hover:scale-105 ${
                        dark 
                          ? "bg-slate-700/50 text-slate-100 hover:bg-slate-700/70 border border-slate-600/30" 
                          : "bg-gray-100/70 text-gray-800 hover:bg-gray-100 border border-gray-200/50"
                      }`}
                      onClick={() => {
                        try {
                          setSelectedHistoryItem(m);
                          setShowHistoryDetail(true);
                          setShowHistoryBox(false);
                        } catch (error) {
                          console.error("Error opening history detail from box:", error)
                          setShowHistoryDetail(false)
                          setSelectedHistoryItem(null)
                          setShowHistoryBox(false)
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{m.with === "المنظم" ? "المنظم" : `#${m.with || "?"}`}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          dark 
                            ? "bg-slate-800/50 text-slate-300" 
                            : "bg-gray-200/70 text-gray-600"
                        }`}>
                          ج{m.round}
                        </span>
                        {m.is_repeat_match && (
                          <span className={`text-xs px-1 py-1 rounded-full ${
                            dark 
                              ? "bg-amber-600/70 text-amber-200" 
                              : "bg-amber-200/70 text-amber-700"
                          }`}>
                            <AlertTriangle className="w-2 h-2 inline" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`font-bold text-sm ${
                          (m.with && typeof m.with === 'string' && m.with.includes("،") ? (m.score || 0) * 10 : (m.score || 0)) >= 80 ? "text-green-500" :
                          (m.with && typeof m.with === 'string' && m.with.includes("،") ? (m.score || 0) * 10 : (m.score || 0)) >= 60 ? "text-yellow-500" :
                          (m.with && typeof m.with === 'string' && m.with.includes("،") ? (m.score || 0) * 10 : (m.score || 0)) >= 40 ? "text-orange-500" :
                          "text-red-500"
                        }`}>
                          {m.with && typeof m.with === 'string' && m.with.includes("،") ? `${Math.round((m.score || 0) * 10)}%` : `${m.score || 0}%`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* History Detail Modal */}
        {showHistoryDetail && selectedHistoryItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`max-w-md w-full sm:max-w-lg mx-2 sm:mx-4 rounded-2xl p-4 sm:p-8 shadow-2xl border-2 ${dark ? "bg-slate-800/80 border-slate-600" : "bg-white/80 border-gray-200"} max-h-[90vh] overflow-y-auto sleek-scrollbar`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-bold ${dark ? "text-slate-100" : "text-gray-800"}`}>تفاصيل اللقاء</h3>
              <Button variant="ghost" onClick={() => {
                setShowHistoryDetail(false)
                setSelectedHistoryItem(null)
              }}><X /></Button>
            </div>
            
            <div className="space-y-6">
              {/* Match Header */}
              <div className={`text-center p-6 rounded-xl border ${dark ? "bg-slate-700/50 border-slate-600" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center ${dark ? "bg-blue-600/20 border-blue-400" : "bg-blue-100 border-blue-300"}`}>
                    <span className={`text-2xl font-bold ${dark ? "text-blue-200" : "text-blue-700"}`}>#{assignedNumber || "?"}</span>
                  </div>
                  <div className={`text-3xl ${dark ? "text-slate-300" : "text-gray-500"}`}>×</div>
                  <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center ${dark ? "bg-cyan-600/20 border-cyan-400" : "bg-cyan-100 border-cyan-300"}`}>
                    <span className={`text-2xl font-bold ${dark ? "text-cyan-200" : "text-cyan-700"}`}>{selectedHistoryItem.with === "المنظم" ? "المنظم" : `#${selectedHistoryItem.with}`}</span>
                  </div>
                </div>
                <h4 className={`text-lg font-semibold mb-2 ${dark ? "text-slate-200" : "text-gray-800"}`}>الجولة {selectedHistoryItem.round}</h4>
                {selectedHistoryItem.is_repeat_match && (
                  <div className={`mb-2 p-2 rounded-lg ${dark ? "bg-amber-500/20 border border-amber-400/40" : "bg-amber-100/50 border border-amber-300/40"}`}>
                    <div className="flex items-center justify-center gap-2">
                      <AlertTriangle className={`w-4 h-4 ${dark ? "text-amber-300" : "text-amber-600"}`} />
                      <span className={`text-sm font-bold ${dark ? "text-amber-200" : "text-amber-700"}`}>تكرار المقابلة</span>
                    </div>
                  </div>
                )}
                <div className={`text-4xl font-bold ${dark ? "text-cyan-300" : "text-cyan-600"}`}>
                  {selectedHistoryItem.with && typeof selectedHistoryItem.with === 'string' && selectedHistoryItem.with.includes("،") ? `${Math.round((selectedHistoryItem.score || 0) * 10)}%` : `${selectedHistoryItem.score || 0}%`}
                </div>
                <div className={`text-sm ${dark ? "text-slate-400" : "text-gray-600"}`}>درجة التوافق</div>
              </div>

              {/* Compatibility Details */}
              <div className={`p-4 rounded-xl border ${dark ? "bg-slate-700/30 border-slate-600" : "bg-gray-50 border-gray-200"}`}>
                <h5 className={`font-semibold mb-3 ${dark ? "text-slate-200" : "text-gray-800"}`}>تحليل التوافق</h5>
                {(() => {
                  try {
                    if (!selectedHistoryItem || !selectedHistoryItem.reason) {
                      return (
                        <div className={`text-center p-4 ${dark ? "text-slate-300" : "text-gray-600"}`}>
                          <p>معلومات التوافق غير متوفرة</p>
                        </div>
                      )
                    }
                    
                    const formattedReason = formatCompatibilityReason(selectedHistoryItem.reason)
                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-2">
                          {formattedReason.components && formattedReason.components.length > 0 ? (
                            formattedReason.components.map((component: { name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }, index: number) => (
                              <div 
                                key={index}
                                className={`p-2 rounded-lg border ${component.bgColor} ${component.borderColor} backdrop-blur-sm`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-xs font-semibold ${dark ? "text-slate-200" : "text-gray-800"}`}>
                                    {component.name}
                                  </span>
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${component.color} ${component.bgColor}`}>
                                    {component.strength}
                                  </span>
                                </div>
                                <p className={`text-xs ${dark ? "text-slate-300" : "text-gray-600"}`}>
                                  {component.description}
                                </p>
                              </div>
                            ))
                          ) : (
                            <div className={`text-center p-4 ${dark ? "text-slate-300" : "text-gray-600"}`}>
                              <p>{formattedReason.originalReason}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  } catch (error) {
                    console.error("Error formatting compatibility reason:", error)
                    return (
                      <div className={`text-center p-4 ${dark ? "text-slate-300" : "text-gray-600"}`}>
                        <p>معلومات التوافق غير متوفرة</p>
                      </div>
                    )
                  }
                })()}
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
                  <h5 className={`font-semibold mb-2 ${dark ? "text-slate-200" : "text-gray-800"}`}>نوع المقابلة</h5>
                  <p className={`text-lg font-bold ${dark ? "text-blue-300" : "text-blue-600"}`}>
                    {selectedHistoryItem.type || "غير محدد"}
                  </p>
                </div>
              </div>
              {/* Compatibility Score Bar */}
              <div className={`p-4 rounded-xl border ${dark ? "bg-slate-700/30 border-slate-600" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex justify-between items-center mb-2">
                  <h5 className={`font-semibold ${dark ? "text-slate-200" : "text-gray-800"}`}>مستوى التوافق</h5>
                  <span className={`font-bold ${dark ? "text-cyan-300" : "text-cyan-600"}`}>
                    {selectedHistoryItem.with && typeof selectedHistoryItem.with === 'string' && selectedHistoryItem.with.includes("،") ? `${Math.round((selectedHistoryItem.score || 0) * 10)}%` : `${selectedHistoryItem.score || 0}%`}
                  </span>
                </div>
                <div className={`w-full h-3 rounded-full ${dark ? "bg-slate-600" : "bg-gray-200"}`}>
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      (selectedHistoryItem.with && typeof selectedHistoryItem.with === 'string' && selectedHistoryItem.with.includes("،") ? (selectedHistoryItem.score || 0) * 10 : (selectedHistoryItem.score || 0)) >= 80 ? "bg-green-500" :
                      (selectedHistoryItem.with && typeof selectedHistoryItem.with === 'string' && selectedHistoryItem.with.includes("،") ? (selectedHistoryItem.score || 0) * 10 : (selectedHistoryItem.score || 0)) >= 60 ? "bg-yellow-500" :
                      (selectedHistoryItem.with && typeof selectedHistoryItem.with === 'string' && selectedHistoryItem.with.includes("،") ? (selectedHistoryItem.score || 0) * 10 : (selectedHistoryItem.score || 0)) >= 40 ? "bg-orange-500" :
                      "bg-red-500"
                    }`}
                    style={{ width: `${selectedHistoryItem.with && typeof selectedHistoryItem.with === 'string' && selectedHistoryItem.with.includes("،") ? (selectedHistoryItem.score || 0) * 10 : (selectedHistoryItem.score || 0)}%` }}
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

      {/* Partner Started Notification */}
      {showPartnerStartedNotification && (
        <div className={`fixed top-8 right-1/2 translate-x-1/2 z-50 bg-green-500/90 text-white px-6 py-3 rounded-xl shadow-lg text-lg font-bold animate-in fade-in duration-300`}>
          شريكك بدأ الحوار!
        </div>
      )}

      {/* Prompts/Questions Modal */}
      <PromptTopicsModal open={showPromptTopicsModal} onClose={() => setShowPromptTopicsModal(false)} dark={dark} />

      </div>
    </>
  )
}
