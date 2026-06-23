import { useState, useEffect, useRef, lazy, Suspense, useMemo, useLayoutEffect, useCallback } from "react"
import type { MouseEvent, FormEvent, CSSProperties } from "react"
import { useSearchParams } from "react-router"
import { X } from "lucide-react"
import toast, { Toaster } from 'react-hot-toast'
import logoPng from "../welcome/blindmatch.png"

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
  UserRound,
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
  UserPlus,
  RotateCcw,
  Mail,
  MessageCircle,
  Flame,
  Compass,
  Layers,
  Bell,
  Info,
  Home,
} from "lucide-react"
import { Button } from "../../components/ui/button"
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
import CircularProgressBar from "../components/CircularProgressBar"

import { motion, AnimatePresence } from "framer-motion"
import confetti from "canvas-confetti"
// Use layout effect only on client to avoid SSR warnings
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
// Performance: Lazy load heavy components to improve initial page load
const AIQuestionsGenerator = lazy(() => import("../components/AIQuestionsGenerator"))
const SurveyComponent = lazy(() => import("../components/SurveyComponent"))
const PromptTopicsModal = lazy(() => import("../components/PromptTopicsModal"))

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

interface FeedbackAnswersState {
  compatibilityRate: number
  sliderMoved: boolean
  conversationQuality: number
  personalConnection: number
  sharedInterests: number
  comfortLevel: number
  communicationStyle: number
  wouldMeetAgain: number
  overallExperience: number
  recommendations: string
  organizerImpression: string
  participantMessage: string
}

const RATING_LABELS: Record<number, string> = {
  1: "ضعيف جداً",
  2: "ضعيف",
  3: "متوسط",
  4: "جيد",
  5: "ممتاز"
}

const RATING_SEGMENT_PALETTE: Record<number, { active: string; ring: string }> = {
  1: { active: "bg-red-500 border-red-500 text-white", ring: "focus-visible:ring-red-400/60" },
  2: { active: "bg-orange-500 border-orange-500 text-white", ring: "focus-visible:ring-orange-400/60" },
  3: { active: "bg-yellow-500 border-yellow-500 text-white", ring: "focus-visible:ring-yellow-400/60" },
  4: { active: "bg-lime-500 border-lime-500 text-white", ring: "focus-visible:ring-lime-400/60" },
  5: { active: "bg-green-500 border-green-500 text-white", ring: "focus-visible:ring-emerald-400/60" }
}

const ORGANIZER_IDEA_CHIPS = [
  "أكثر ما أعجبني هو طريقة حديثه الواثقة",
  "شعرت أنه محترم ولطيف في الحوار",
  "تحدث بثقة وهدوء ساعدني على الارتياح",
  "أحتاج وقتاً أطول لأرتاح أكثر مع هذه الشخصية"
]

const RECOMMENDATION_IDEA_CHIPS = [
  "زيادة وقت الاستراحة بين الجولات",
  "تقليل مستوى الضوضاء في القاعة",
  "أحببت التنظيم الحالي وأتمنى استمراره",
  "نود أسئلة أعمق في الجولة القادمة"
]

const PARTICIPANT_MESSAGE_CHIPS = [
  "شكراً على المحادثة الجميلة اليوم!",
  "سعدت بالتعرف عليك وأتمنى أن نلتقي مجدداً",
  "أحببت طريقة تفكيرك وهدوءك",
  "أراك شخصاً لطيفاً وممتعاً في الحديث"
]

type RatingKey =
  | 'conversationQuality'
  | 'personalConnection'
  | 'sharedInterests'
  | 'comfortLevel'
  | 'communicationStyle'
  | 'wouldMeetAgain'
  | 'overallExperience'

type TextFieldKey = 'organizerImpression' | 'recommendations' | 'participantMessage'

const TEXT_FIELD_LIMITS: Record<TextFieldKey, number> = {
  organizerImpression: 500,
  recommendations: 500,
  participantMessage: 500
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))


export default function WelcomePage() {
  const [step, setStep] = useState<number>(0)
  const [dark, setDark] = useState(true) // Default to dark mode
  const [assignedNumber, setAssignedNumber] = useState<number | null>(null)
  const [participantName, setParticipantName] = useState<string | null>(null)
  const [secureToken, setSecureToken] = useState<string | null>(null)
  const [showTokenModal, setShowTokenModal] = useState(false)
  const [showSurveySuccessModal, setShowSurveySuccessModal] = useState(false)
  const [suppressPollingUntil, setSuppressPollingUntil] = useState<number | null>(null)
  
  // Database check states for conditional question display
  const [participantHasHumorStyle, setParticipantHasHumorStyle] = useState(false)
  const [participantHasOpennessComfort, setParticipantHasOpennessComfort] = useState(false)

  // Celebrate on survey success open
  useEffect(() => {
    if (!showSurveySuccessModal) return
    try {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.2 } })
      setTimeout(() => confetti({ particleCount: 40, spread: 80, origin: { y: 0.3 } }), 280)
    } catch (_) {}
  }, [showSurveySuccessModal])
  
  // Auto-clear the post-submit polling suppression
  useEffect(() => {
    if (!suppressPollingUntil) return
    const ms = suppressPollingUntil - Date.now()
    if (ms <= 0) {
      setSuppressPollingUntil(null)
      return
    }
    const t = setTimeout(() => setSuppressPollingUntil(null), ms)
    return () => clearTimeout(t)
  }, [suppressPollingUntil])
  
  // Vibe questions completion popup states
  const vibeCompletionPopupEnabled = false
  const [showVibeCompletionPopup, setShowVibeCompletionPopup] = useState(false)
  const [incompleteVibeQuestions, setIncompleteVibeQuestions] = useState<{[key: string]: {current: number, required: number, max: number, label: string}}>({})
  const [vibeAnswers, setVibeAnswers] = useState<{[key: string]: string}>({})
  const [vibeLoading, setVibeLoading] = useState(false)
  
  // Track if user just created token (to prevent showing incomplete survey popup during registration)
  const [isJustCreatedUser, setIsJustCreatedUser] = useState(false)

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
  const [phase, setPhase] = useState<"registration" | "form" | "waiting" | "round_1" | "waiting_2" | "round_2" | "group_phase" | /* "waiting_3" | "round_3" | "waiting_4" | "round_4" | "group_phase" | */ null>(null)
  const [tableNumber, setTableNumber] = useState<number | null>(null)
  const [compatibilityScore, setCompatibilityScore] = useState<number | null>(null)
  const [humorBonus, setHumorBonus] = useState<'full' | 'partial' | 'none'>('none')
  const [isScoreRevealed, setIsScoreRevealed] = useState(false)
  
  // Helper function to calculate original score (before bonus)
  const getOriginalScore = (): number => {
    if (!compatibilityScore || humorBonus === 'none') return compatibilityScore || 0
    const multiplier = humorBonus === 'full' ? 1.15 : 1.05
    return Math.round(compatibilityScore / multiplier)
  }

  // Labels under segmented controls (1–5)
  const ratingLabel = (v: number) => RATING_LABELS[v] ?? RATING_LABELS[3]

  const setRatingValue = (key: RatingKey, value: number) => {
    setFeedbackAnswers(prev => ({ ...prev, [key]: value }))
  }

  const renderRatingSegment = (key: RatingKey) => {
    const currentValue = feedbackAnswers[key]
    return (
      <div className="flex items-center justify-between gap-2" dir="ltr">
        {[1, 2, 3, 4, 5].map((value) => {
          const palette = RATING_SEGMENT_PALETTE[value] ?? { active: "", ring: "" }
          const active = currentValue === value
          return (
            <motion.button
              key={value}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setRatingValue(key, value)}
              className={`relative flex min-w-[52px] min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-2 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 ${palette.ring} ${
                active
                  ? `${palette.active} shadow-lg shadow-black/15`
                  : dark
                    ? "border-slate-500/40 bg-white/10 text-slate-200 hover:bg-white/20"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
              aria-pressed={active}
            >
              <span className="text-lg font-bold leading-none">{value}</span>
              <span className={`text-[11px] font-medium ${active ? "text-white/90" : dark ? "text-slate-400" : "text-gray-500"}`}>
                {ratingLabel(value)}
              </span>
            </motion.button>
          )
        })}
      </div>
    )
  }

  const handleTextFieldChange = (field: TextFieldKey, value: string) => {
    const limit = TEXT_FIELD_LIMITS[field]
    const trimmed = value.slice(0, limit)
    setFeedbackAnswers(prev => ({ ...prev, [field]: trimmed }))
  }

  const handleIdeaChip = (field: TextFieldKey, chip: string) => {
    const limit = TEXT_FIELD_LIMITS[field]
    setFeedbackAnswers(prev => {
      const existing = prev[field]
      const separator = existing.length > 0 ? (existing.endsWith(' ') ? '' : ' ') : ''
      const nextValue = `${existing}${separator}${chip}`.trim().slice(0, limit)
      return { ...prev, [field]: nextValue }
    })
    requestAnimationFrame(() => {
      textFieldRefs[field]?.current?.focus()
      textFieldRefs[field]?.current?.setSelectionRange(textFieldRefs[field]?.current?.value.length ?? 0, textFieldRefs[field]?.current?.value.length ?? 0)
    })
  }
  const [conversationStarted, setConversationStarted] = useState(false)
  const [conversationTimer, setConversationTimer] = useState(1800) // 30 minutes
  const [globalTimerActive, setGlobalTimerActive] = useState(false)
  const [globalTimerStartTime, setGlobalTimerStartTime] = useState<string | null>(null)
  const [globalTimerDuration, setGlobalTimerDuration] = useState(1800)
  const [round1LocalTimer, setRound1LocalTimer] = useState(2700) // Local timer for Round 1 (counts down from 45 mins)
  const [timerRestored, setTimerRestored] = useState(false)
  const [timerRestoreAttempted, setTimerRestoreAttempted] = useState(false)
  
  // Utility function to clear timer localStorage backup
  const clearTimerLocalStorage = () => {
    localStorage.removeItem('timerRestored');
    localStorage.removeItem('timerStartTime');
    localStorage.removeItem('timerDuration');
    // Cleared timer localStorage backup
  }
  
  const [feedbackAnswers, setFeedbackAnswers] = useState({
    compatibilityRate: 50, // 0-100 scale
    sliderMoved: false, // Track if slider has been moved
    conversationQuality: 3, // 1-5 scale
    personalConnection: 3, // 1-5 scale
    sharedInterests: 3, // 1-5 scale
    comfortLevel: 3, // 1-5 scale
    communicationStyle: 3, // 1-5 scale
    wouldMeetAgain: 3, // 1-5 scale
    overallExperience: 3, // 1-5 scale
    recommendations: "",
    organizerImpression: "", // Optional organizer-only general impression
    participantMessage: "" // Optional message to conversation partner
  })
  const [feedbackNextEventSignup, setFeedbackNextEventSignup] = useState(false)
  // Feedback UX state & helpers
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [showMicroSuccess, setShowMicroSuccess] = useState(false)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const [showQuestionsPeek, setShowQuestionsPeek] = useState(false)

  // Autosize feedback textareas up to ~6 lines
  useEffect(() => {
    const autoResize = (el: HTMLTextAreaElement | null) => {
      if (!el) return
      el.style.height = 'auto'
      const lh = parseInt(getComputedStyle(el).lineHeight || '22', 10) || 22
      const max = lh * 6 + 8
      el.style.maxHeight = `${max}px`
      el.style.height = `${Math.min(el.scrollHeight, max)}px`
    }
    autoResize(organizerImpressionRef.current)
    autoResize(recommendationsRef.current)
    autoResize(participantMessageRef.current)
  }, [feedbackAnswers.organizerImpression, feedbackAnswers.recommendations, feedbackAnswers.participantMessage])

  const getFeedbackProgress = (): number => {
    try {
      const ratings = [
        feedbackAnswers.conversationQuality,
        feedbackAnswers.personalConnection,
        feedbackAnswers.sharedInterests,
        feedbackAnswers.comfortLevel,
        feedbackAnswers.communicationStyle,
        feedbackAnswers.overallExperience,
      ]
      const ratingCompleted = ratings.filter(v => v !== 3).length
      let done = ratingCompleted + (feedbackAnswers.sliderMoved ? 1 : 0)
      let total = ratings.length + 1 // ratings + slider
      if ((currentRound === 1 || currentRound === 2) && matchResult && matchResult !== 'المنظم') {
        total += 1
        if (typeof wantMatch === 'boolean') done += 1
      }
      const pct = Math.max(0, Math.min(100, Math.round((done / Math.max(1, total)) * 100)))
      return pct
    } catch {
      return 0
    }
  }

  const isFeedbackMinimalComplete = (): boolean => {
    const sliderOk = !!feedbackAnswers.sliderMoved && feedbackAnswers.compatibilityRate !== 50
    const wantOk = !((currentRound === 1 || currentRound === 2) && matchResult && matchResult !== 'المنظم') || typeof wantMatch === 'boolean'
    return sliderOk && wantOk
  }


  const searchParams = useSearchParams()[0]
  const token = searchParams.get("token")
  const forceRound = searchParams.get("force_round")
  const [typewriterText, setTypewriterText] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [typewriterCompleted, setTypewriterCompleted] = useState(false)
  const [currentRound, setCurrentRound] = useState(1)
  
  // Option D: overlay rectangles to mask local background under cards, keeping particles visible around edges
  const roundWrapperRef = useRef<HTMLDivElement | null>(null)
  const matchCardRef = useRef<HTMLDivElement | null>(null)
  const qCardRef = useRef<HTMLDivElement | null>(null)
  const [overlayRects, setOverlayRects] = useState<Array<{ top: number; left: number; width: number; height: number; radius: number }>>([])

  const recomputeOverlayRects = useCallback(() => {
    const wrapper = roundWrapperRef.current
    if (!wrapper) return
    const wr = wrapper.getBoundingClientRect()
    const rects: Array<{ top: number; left: number; width: number; height: number; radius: number }> = []
    if (qCardRef.current) {
      const r = qCardRef.current.getBoundingClientRect()
      rects.push({
        top: r.top - wr.top,
        left: r.left - wr.left,
        width: r.width,
        height: r.height,
        radius: 16, // rounded-2xl
      })
    }
    setOverlayRects(rects)
  }, [])

  
  
  // AI Vibe Analysis states
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false)
  const [showAiAnalysis, setShowAiAnalysis] = useState(false)
  const [displayedAnalysis, setDisplayedAnalysis] = useState<string>("")
  const [isAnalysisTyping, setIsAnalysisTyping] = useState(false)
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
    answers: {
      gender_preference: "opposite_gender" // Default selection for radio button
    },
    termsAccepted: false,
    dataConsent: false
  })
  
  const [showSurvey, setShowSurvey] = useState(false)
  const [isEditingSurvey, setIsEditingSurvey] = useState(false)
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
  const [justCompletedEditing, setJustCompletedEditing] = useState(false); // Track if user just completed editing to prevent popup loop
  const [tokenValidationCompleted, setTokenValidationCompleted] = useState(false); // Track if token validation has been completed
  
  // Helper function to check if user has substantial survey data (more than just default values)
  const hasSubstantialSurveyData = (answers: Record<string, string | string[]> | undefined) => {
    if (!answers) return false;
    const keys = Object.keys(answers);
    // If more than 1 key, definitely has substantial data
    if (keys.length > 1) return true;
    // If exactly 1 key and it's not just the default gender_preference, has substantial data
    if (keys.length === 1 && !answers.gender_preference) return true;
    // Otherwise, only has default values
    return false;
  };
  useEffect(() => {
    if (modalStep !== 'feedback') { setKeyboardOffset(0); return }
    const vv: any = (window as any).visualViewport
    const handler = () => {
      if (!vv) return
      const delta = Math.max(0, window.innerHeight - vv.height)
      setKeyboardOffset(delta)
    }
    handler()
    vv?.addEventListener('resize', handler)
    return () => vv?.removeEventListener('resize', handler)
  }, [modalStep])
  // Enhanced Participant Number Badge Component
  const ParticipantBadge = ({ 
    size = "default", 
    showStatus = true, 
    className = "" 
  }: { 
    size?: "small" | "default" | "large", 
    showStatus?: boolean, 
    className?: string 
  }) => {
    const sizeClasses = {
      small: "w-10 h-10 text-sm",
      default: "w-16 h-16 text-2xl",
      large: "w-20 h-20 text-3xl"
    };

    const statusSize = {
      small: "w-3 h-3 -top-0.5 -right-0.5",
      default: "w-4 h-4 -top-1 -right-1", 
      large: "w-5 h-5 -top-1.5 -right-1.5"
    };

    return (
      <div className={`relative ${className}`}>
        <div className={`
          ${sizeClasses[size]}
          rounded-full 
          flex items-center justify-center 
          font-bold 
          shadow-2xl 
          border-2 
          transition-all 
          duration-300 
          hover:scale-110 
          hover:shadow-3xl
          ${dark 
            ? "bg-gradient-to-br from-slate-700 via-slate-600 to-slate-800 border-slate-400/50 text-white shadow-slate-900/50" 
            : "bg-gradient-to-br from-white via-gray-50 to-gray-100 border-gray-300 text-gray-800 shadow-gray-500/30"
          }
        `}>
          <span className="tracking-wider drop-shadow-sm">
            {assignedNumber ?? "؟"}
          </span>
          
          {/* Inner glow effect */}
          <div className={`
            absolute inset-0 rounded-full opacity-20
            ${dark 
              ? "bg-gradient-to-br from-cyan-400 to-blue-500" 
              : "bg-gradient-to-br from-blue-400 to-cyan-500"
            }
          `}></div>
        </div>
        
        {/* Status indicator */}
        {showStatus && (
          <div className={`
            absolute ${statusSize[size]}
            bg-gradient-to-r from-green-400 to-emerald-500
            rounded-full 
            border-2 border-white 
            animate-pulse
            shadow-lg
          `}>
            <div className="w-full h-full rounded-full bg-gradient-to-r from-green-300 to-emerald-400 opacity-60"></div>
          </div>
        )}
        
        {/* Subtle outer ring animation */}
        <div className={`
          absolute inset-0 rounded-full border-2 border-transparent
          animate-ping opacity-20
          ${dark ? "border-cyan-400" : "border-blue-400"}
        `} style={{ animationDuration: '3s' }}></div>
      </div>
    );
  };
  
  // New User Type Popup states (highest priority)
  const [showNewUserTypePopup, setShowNewUserTypePopup] = useState(false)
  const [newUserTokenInput, setNewUserTokenInput] = useState("")
  const [newUserTokenLoading, setNewUserTokenLoading] = useState(false)
  const [showFAQPopup, setShowFAQPopup] = useState(false)
  
  // Contact Form states
  const [showContactForm, setShowContactForm] = useState(false)
  const [showInfoPopup, setShowInfoPopup] = useState(false)
  const [contactForm, setContactForm] = useState({
    email: "",
    name: "",
    phone: "",
    message: "",
    subject: ""
  })
  const [contactFormLoading, setContactFormLoading] = useState(false)
  
  // Next Event Signup Popup states
  const [showNextEventPopup, setShowNextEventPopup] = useState(false)
  const [nextEventSignupLoading, setNextEventSignupLoading] = useState(false)
  const [showNextEventSignup, setShowNextEventSignup] = useState(false)
  const [participantInfo, setParticipantInfo] = useState<{name: string, assigned_number: number} | null>(null)
  
  // Survey Completion Popup states
  const [showSurveyCompletionPopup, setShowSurveyCompletionPopup] = useState(false)
  const [incompleteSurveyInfo, setIncompleteSurveyInfo] = useState<{name: string, assigned_number: number, secure_token: string} | null>(null)
  // Survey Recovery Popup (technical issue) states
  const [showSurveyRecoveryPopup, setShowSurveyRecoveryPopup] = useState(false)
  const [surveyRecoveryInfo, setSurveyRecoveryInfo] = useState<{assigned_number?: number, secure_token: string, name?: string} | null>(null)
  // Redo flow guard
  const [redoHandled, setRedoHandled] = useState(false)
  // Disable auto-signup URL action guard
  const [disableAutoHandled, setDisableAutoHandled] = useState(false)
  // New states for match preference and partner reveal
  const [wantMatch, setWantMatch] = useState<boolean | null>(null);
  const [partnerInfo, setPartnerInfo] = useState<{ name?: string | null; age?: number | null; phone_number?: string | null } | null>(null);
  const [resultToken, setResultToken] = useState("");
  const [returningPlayerToken, setReturningPlayerToken] = useState("");
  const [currentEventId, setCurrentEventId] = useState(1);
  const [isShowingFinishedEventFeedback, setIsShowingFinishedEventFeedback] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showRound1Guide, setShowRound1Guide] = useState(false);

  const round1AccessorySrc = (() => {
    const raw = String(surveyData?.gender ?? (surveyData?.answers as any)?.gender ?? '')
      .trim()
      .toLowerCase()

    if (!raw) return null

    const isFemale = raw === 'female' || raw === 'f' || raw.includes('أنث') || raw.includes('انث')
    const isMale = raw === 'male' || raw === 'm' || raw.includes('ذكر')

    if (isFemale) return '/PinkRibbon.png'
    if (isMale) return '/Mustache.png'
    return null
  })()

  useEffect(() => {
    setWantMatch(null)
    setPartnerInfo(null)
  }, [currentRound])
  
  // Overlay recompute mounts and updates (moved here to avoid TDZ on currentQuestionIndex)
  useIsomorphicLayoutEffect(() => {
    recomputeOverlayRects()
  }, [])

  useEffect(() => {
    recomputeOverlayRects()
  }, [step, currentRound, currentQuestionIndex, conversationStarted, showPromptTopicsModal, recomputeOverlayRects])

  useEffect(() => {
    let ro: any = null
    try {
      const RO: any = (typeof window !== 'undefined' && (window as any).ResizeObserver) || null
      if (RO) {
        ro = new RO(() => recomputeOverlayRects())
        const w = roundWrapperRef.current
        const m = matchCardRef.current
        const q = qCardRef.current
        if (w) ro.observe(w)
        if (m) ro.observe(m)
        if (q) ro.observe(q)
      }
    } catch {}
    const onResize = () => recomputeOverlayRects()
    window.addEventListener('resize', onResize)
    return () => {
      try { ro && ro.disconnect && ro.disconnect() } catch {}
      window.removeEventListener('resize', onResize)
    }
  }, [recomputeOverlayRects])
  
  // Question pace tracking for gentle nudge
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [timeOnCurrentQuestion, setTimeOnCurrentQuestion] = useState(0);
  const [showPaceNudge, setShowPaceNudge] = useState(false);
  const [hasArrived, setHasArrived] = useState(false);
  // 5-minute warning notification
  const [showFiveMinuteWarning, setShowFiveMinuteWarning] = useState(false);
  
  // Question transition animation
  const [questionTransition, setQuestionTransition] = useState<'none' | 'next' | 'prev'>('none');

  // Token validation states
  const [isTokenValid, setIsTokenValid] = useState<boolean | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(true);

  // Brute force protection states
  const [tokenAttempts, setTokenAttempts] = useState(0);
  const [resultTokenAttempts, setResultTokenAttempts] = useState(0);
  const [tokenLockoutUntil, setTokenLockoutUntil] = useState<number | null>(null);
  const [resultTokenLockoutUntil, setResultTokenLockoutUntil] = useState<number | null>(null);
  const [lastTokenAttempt, setLastTokenAttempt] = useState<number | null>(null);
  const [lastResultTokenAttempt, setLastResultTokenAttempt] = useState<number | null>(null);

  // Returning participant states
  const [returningPhoneNumber, setReturningPhoneNumber] = useState("");
  const [returningLoading, setReturningLoading] = useState(false);
  const [returningGenderPreference, setReturningGenderPreference] = useState("");
  const [returningHumorStyle, setReturningHumorStyle] = useState("");
  const [returningOpennessComfort, setReturningOpennessComfort] = useState("");
  const [autoSignupNextEvent, setAutoSignupNextEvent] = useState(false);
  const [autoSignupEnabled, setAutoSignupEnabled] = useState(false);
  const [showReturningSignupPopup, setShowReturningSignupPopup] = useState(false);
  const [isCheckingMatch, setIsCheckingMatch] = useState(false);
  const hasCheckedMatchRef = useRef(false);
  const hasForcedRound1Ref = useRef(false);

  // Call API to verify participant actually has a real match (not 9999) for the given round.
  // Defaults to round 1 for backwards compatibility.
  const hasValidMatchForRound1 = async (eventId: number, roundOverride?: number) => {
    // If we've already confirmed a valid match previously for this round, short-circuit to true
    if (hasCheckedMatchRef.current) return true;

    setIsCheckingMatch(true);
    try {
      const tokenToUse = token || secureToken;
      if (!tokenToUse) {
        console.log("No token available for match check");
        return false;
      }
      const targetRound = roundOverride ?? 1;
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "has-valid-match",
          secure_token: tokenToUse,
          event_id: eventId || 1,
          round: targetRound
        })
      })
      const data = await res.json()
      const hasMatch = !!(res.ok && data?.success && data?.has_valid_match === true);
      if (hasMatch) {
        hasCheckedMatchRef.current = true; // Mark as checked if we found a valid match
      }
      return hasMatch;
    } catch (error) {
      console.error("Error checking valid match:", error);
      return false;
    } finally {
      setIsCheckingMatch(false);
    }
  }


  const historyBoxRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const compatibilityRef = useRef<HTMLDivElement>(null);
  const shouldScrollToAnalysisRef = useRef<boolean>(false);
  const organizerImpressionRef = useRef<HTMLTextAreaElement>(null);
  const recommendationsRef = useRef<HTMLTextAreaElement>(null);
  const participantMessageRef = useRef<HTMLTextAreaElement>(null);

  const textFieldRefs: Record<TextFieldKey, React.RefObject<HTMLTextAreaElement>> = {
    organizerImpression: organizerImpressionRef,
    recommendations: recommendationsRef,
    participantMessage: participantMessageRef,
  }

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
  // Idea chips for textareas
  const organizerImpressionIdeas = [
    "شعرت بالراحة أثناء الحديث",
    "أسلوب مهذب وهادئ",
    "طاقة إيجابية وتفاعل جميل",
    "احترام للوقت والإنصات",
    "مبادرة لطيفة بطرح الأسئلة"
  ];
  const recommendationsIdeas = [
    "زيادة الوقت بين الجولات",
    "توضيح أفضل لقواعد الجولة",
    "تحسين توزيع المقاعد",
    "موسيقى خلفية هادئة",
    "تسريع إجراءات الدخول"
  ];
  const participantMessageIdeas = [
    "سعدت بالتعرّف عليك اليوم!",
    "حديثك كان ممتع ومريح",
    "أتمنى لك كل التوفيق",
    "يسعدني نستمر في الحديث لاحقًا"
  ];
  
  // Set 3: Additional curated Round 1 questions
  const round3Questions = [

    // Level 0: Quick Connect - Natural Common Ground ⚡
    // Goal: Low stakes, fun, immediate personality indicators.
  
    {
      title: `التصنيف الرقمي`,
      question: `لو فتّشنا جوالك الحين… أي تطبيق آكل وقتك أكثر شي؟ وتحس راضي عنه ولا ودّك تخففه؟`,
      level: 0,
      levelTitle: `اتصال سريع`,
      levelIcon: `Zap`
    },
  
    {
      title: `سفرة الأحلام`,
      question: `لو جاك بكرة تذكرة مفتوحة لأي مكان بالعالم… بس لازم تروح لحالك. وين تروح؟ وليه؟`,
      level: 0,
      levelTitle: `اتصال سريع`,
      levelIcon: `Zap`
    },
  
    {
      title: `أكلة الطفولة`,
      question: `وش أكلة/ريحة أول ما تشمّها ترجعك فورًا لبيت أهلك أو لأيام الطفولة؟`,
      level: 0,
      levelTitle: `اتصال سريع`,
      levelIcon: `Zap`
    },
  
    {
      title: `القوة الخارقة`,
      question: `لو تقدر تختار قوة خارقة وحدة… وش بتختار؟ وأول شي بتسويه فيها وش هو؟`,
      level: 0,
      levelTitle: `اتصال سريع`,
      levelIcon: `Zap`
    },
  
    {
      title: `مود الصباح`,
      question: `أنت من فريق "أصحى رايق وأبدأ يومي بهدوء" ولا فريق "لا تكلّمني لين أفطر"؟`,
      level: 0,
      levelTitle: `اتصال سريع`,
      levelIcon: `Zap`
    },
  
    {
      title: `رأي غير شعبي`,
      question: `قل لنا رأي عندك أغلب الناس ما يتفقون معه… وش هو؟`,
      level: 0,
      levelTitle: `اتصال سريع`,
      levelIcon: `Zap`
    },
  
    {
      title: `مشتريات أونلاين`,
      question: `وش أغرب/أغبى شي شريته أونلاين؟ طلع فلة ولا ندمت؟`,
      level: 0,
      levelTitle: `اتصال سريع`,
      levelIcon: `Zap`
    },
  
    // Level 1: The Spark - Breaking the Ice 🧊
    // Goal: Moving from "what you do" to "how you think".
  
    {
      title: `مهارة فورية`,
      question: `لو تتعلم مهارة بثانية وحدة وتصير محترف فيها… وش بتختار؟`,
      level: 1,
      levelTitle: `المستوى الأول: الشرارة - لكسر الحاجز`,
      levelIcon: `Flame`
    },
  
    {
      title: `امتنان بسيط`,
      question: `بعيدًا عن الأهل والصحة… وش شي بسيط بحياتك ممتن له بشكل غريب؟`,
      level: 1,
      levelTitle: `المستوى الأول: الشرارة - لكسر الحاجز`,
      levelIcon: `Flame`
    },
  
    {
      title: `وش يضحكك؟`,
      question: `وش الشي اللي يضحكك ضحك من القلب؟ (مقاطع، مواقف، نكت… اللي هو)`,
      level: 1,
      levelTitle: `المستوى الأول: الشرارة - لكسر الحاجز`,
      levelIcon: `Flame`
    },
  
    {
      title: `عشاء الأحلام`,
      question: `لو بتسوي عشاء وتعزم ٣ أشخاص (حقيقيين أو خياليين)… مين بتختار؟ وعن وش بتسولفون؟`,
      level: 1,
      levelTitle: `المستوى الأول: الشرارة - لكسر الحاجز`,
      levelIcon: `Flame`
    },
  
    // Level 2: The Core - Understanding Values 🧭
    // Goal: Uncovering how they view the world and themselves.
  
    {
      title: `فويس للماضي`,
      question: `لو تقدر ترسل لنفسك قبل ٥ سنوات فويس ١٠ ثواني… وش بتقول؟ (نصيحة/تحذير/تطمن)`,
      level: 2,
      levelTitle: `المستوى الثاني: الجوهر - فهم القيم`,
      levelIcon: `Compass`
    },
  
    {
      title: `متى تعتبر نفسك ناجح؟`,
      question: `متى تقول عن نفسك: "أنا نجحت"؟ وش معيار النجاح عندك: فلوس، راحة بال، إنجاز، أثر…؟`,
      level: 2,
      levelTitle: `المستوى الثاني: الجوهر - فهم القيم`,
      levelIcon: `Compass`
    },
  
    {
      title: `طريقتك وقت الخلاف`,
      question: `وقت الخلاف… أنت تبادر وتعتذر عشان تمشي الأمور؟ ولا لازم توضّح وجهة نظرك أول؟ وكيف هالشي يأثر على علاقاتك؟`,
      level: 2,
      levelTitle: `المستوى الثاني: الجوهر - فهم القيم`,
      levelIcon: `Compass`
    },
  
    {
      title: `منطق ولا حدس؟`,
      question: `في القرارات الكبيرة… تميل للمنطق والتحليل ولا تمشي على حدسك؟ واذكر موقف خذلك واحد منهم.`,
      level: 2,
      levelTitle: `المستوى الثاني: الجوهر - فهم القيم`,
      levelIcon: `Compass`
    },
  
    {
      title: `وين ترتاح؟`,
      question: `وش المكان/الحالة اللي تحس فيها إنك "على طبيعتك" ١٠٠٪ بدون أي تكلّف؟`,
      level: 2,
      levelTitle: `المستوى الثاني: الجوهر - فهم القيم`,
      levelIcon: `Compass`
    },
  
    {
      title: `الخوف اللي يدفعك`,
      question: `وش خوف عندك… بس بنفس الوقت هو اللي يدزّك لقدّام ويخليك تنجز؟`,
      level: 2,
      levelTitle: `المستوى الثاني: الجوهر - فهم القيم`,
      levelIcon: `Compass`
    },
  
    // Level 3: Sharing Experiences - مشاركة التجارب 💫
    // Goal: Vulnerability and storytelling.
  
    {
      title: `أكبر مخاطرة`,
      question: `سولف لنا عن أكبر مخاطرة أخذتها بحياتك (شغل/علاقة/قرار). ندمت ولا كانت تستاهل؟`,
      level: 3,
      levelTitle: `المستوى الثالث: مشاركة التجارب`,
      levelIcon: `Sparkles`
    },
  
    {
      title: `لقاء ما يُنسى`,
      question: `قد قابلت شخص غريب بالصدفة لدقايق/ساعات… بس قال كلمة أو صار موقف ما نسيته؟`,
      level: 3,
      levelTitle: `المستوى الثالث: مشاركة التجارب`,
      levelIcon: `Sparkles`
    },
  
    {
      title: `عادة تشتغل عليها`,
      question: `وش عادة/طبع فيك اكتشفت إنه يضرك وقررت تشتغل على تغييره؟`,
      level: 3,
      levelTitle: `المستوى الثالث: مشاركة التجارب`,
      levelIcon: `Sparkles`
    },
  
    {
      title: `حلم الطفولة`,
      question: `وش حلم كنت تحسبه "كل شي" وأنت صغير… وبعدين كبرت وتغيّرت نظرتك له تمامًا؟`,
      level: 3,
      levelTitle: `المستوى الثالث: مشاركة التجارب`,
      levelIcon: `Sparkles`
    },
  
    {
      title: `أصعب وداع`,
      question: `مو شرط شخص… ممكن مكان، وظيفة، أو مرحلة. وش أصعب شي تركته وراك عشان تكمل؟`,
      level: 3,
      levelTitle: `المستوى الثالث: مشاركة التجارب`,
      levelIcon: `Sparkles`
    },
  
    {
      title: `شخص ما قصر معك`,
      question: `مين الشخص اللي وقف معك بوقت صعب بدون مقابل… وتحس إنك ما شكرته كفاية؟`,
      level: 3,
      levelTitle: `المستوى الثالث: مشاركة التجارب`,
      levelIcon: `Sparkles`
    },
  
    // Level 4: "What If?" - Exploring Scenarios 🤝
    // Goal: Testing compatibility and wrapping up the dynamic.
  
    {
      title: `سيناريو المصعد`,
      question: `لو تعطل المصعد فينا ساعتين… أنت بتكون مين؟ (المهدّي/المتوتر/اللي ينكّت)؟ وبرأيك أنا وش بكون؟`,
      level: 4,
      levelTitle: `المستوى الرابع: "ماذا لو؟" - استكشاف السيناريوهات`,
      levelIcon: `Handshake`
    },
  
    {
      title: `الصراحة ولا المجاملة`,
      question: `لو سألتك رأيك في لبس/فكرة تخصني وأنت مو مقتنع… تجامل عشان مشاعري ولا تقولها بصراحة؟ وإنت وش تفضّل لو مكانّي؟`,
      level: 4,
      levelTitle: `المستوى الرابع: "ماذا لو؟" - استكشاف السيناريوهات`,
      levelIcon: `Handshake`
    },
  
    {
      title: `لو ربحنا`,
      question: `لو ربحنا مبلغ خيالي ولازم نصرفه خلال ٢٤ ساعة وبشكل مشترك… وش أول شي نتفق عليه؟`,
      level: 4,
      levelTitle: `المستوى الرابع: "ماذا لو؟" - استكشاف السيناريوهات`,
      levelIcon: `Handshake`
    },
  
    {
      title: `عنوان اللقاء`,
      question: `بعد هالأسئلة… لو لقائنا اليوم صار كتاب، وش عنوانه؟`,
      level: 4,
      levelTitle: `المستوى الرابع: "ماذا لو؟" - استكشاف السيناريوهات`,
      levelIcon: `Handshake`
    }
  
  ];
  
  
  
  // Round 1 Questions - Level 0: Quick Connect ⚡ & Level 1: The Spark 🧊 & Level 2: The Core 🧭
  const round1Questions = [
  
    // Level 0: Quick Connect - Natural Common Ground ⚡
  
    {
      title: "من أنا؟",
      question: "لو توصف نفسك بثلاث كلمات… وش بتكون؟ وليه اخترتها؟",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    {
      title: "الانسجام",
      question: "وش حركة/كلمة بسيطة تخليك ترتاح لشخص جديد بسرعة؟ وبالعكس… وش شي صغير لو سواه أحد ينفّرك أو يخليك تتردد؟",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    {
      title: "الطاقة",
      question: "وش موضوع لو فتحناه… تقعد تسولف فيه وتنسى الوقت؟",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    {
      title: "الويكند",
      question: "وش شكل الويكند المثالي عندك؟ بيت وهدوء، طلعة مع ناسك، ولا مغامرة خارج المدينة؟",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    {
      title: "الموسيقى",
      question: "وش آخر ٣ أغاني أو فنانين عندك على تكرار وما تملّ منهم؟",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    {
      title: "الانطباع العكسي",
      question: "وش الانطباع اللي الناس غالبًا ياخذونه عنك من أول مرة… بس أنت تحسّه مو دقيق؟",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    {
      title: "فن فاكت",
      question: "قل لنا Fun Fact عنك: موهبة غريبة، معلومة عنك، أو شي يسوي صدمة لطيفة.",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    // Level 1: The Spark - Breaking the Ice 🧊
  
    {
      title: "يومك المثالي",
      question: "لو تعيش يوم مثالي… وش تسوي من أول ما تصحى لين تنام؟",
      level: 1,
      levelTitle: "المستوى الأول: الشرارة - لكسر الحاجز",
      levelIcon: "Flame"
    },
  
    {
      title: "حياة ثانية",
      question: "لو تشتغل شيء بعيد تمامًا عن تخصصك الحالي… وش بيكون؟ وليه تحسّه يناسبك؟",
      level: 1,
      levelTitle: "المستوى الأول: الشرارة - لكسر الحاجز",
      levelIcon: "Flame"
    },
  
    {
      title: "آخر مرة انتعشت",
      question: "اذكر آخر مرة حسّيت بطاقة وحماس قوي… وش كنت تسوي؟ ولحالك ولا مع أحد؟",
      level: 1,
      levelTitle: "المستوى الأول: الشرارة - لكسر الحاجز",
      levelIcon: "Flame"
    },
  
    {
      title: "شي أثّر عليك",
      question: "في كتاب/فيلم/مسلسل/وثائقي أثّر فيك السنة اللي راحت؟ وش هو؟ ووش اللي غيّره فيك؟",
      level: 1,
      levelTitle: "المستوى الأول: الشرارة - لكسر الحاجز",
      levelIcon: "Flame"
    },
  
    // Level 2: The Core - Understanding Values 🧭
  
    {
      title: "مبدأ ما تتنازل عنه",
      question: "وش المبدأ اللي تمشي عليه وما تتنازل عنه مهما كان الموقف؟",
      level: 2,
      levelTitle: "المستوى الثاني: الجوهر - فهم القيم",
      levelIcon: "Compass"
    },
  
    {
      title: "الخط الأحمر",
      question: "وش عندك خط أحمر… الناس ممكن يشوفونه عادي، بس أنت لا؟",
      level: 2,
      levelTitle: "المستوى الثاني: الجوهر - فهم القيم",
      levelIcon: "Compass"
    },
  
    {
      title: "صفة تعجبك في الناس",
      question: "الأشخاص اللي تحترمهم بحياتك… وش الصفة المشتركة بينهم؟ وليه تهمّك هالصفة؟",
      level: 2,
      levelTitle: "المستوى الثاني: الجوهر - فهم القيم",
      levelIcon: "Compass"
    },
  
    {
      title: "الأثر اللي تبغاه",
      question: "لو الناس يتذكرونك بشي واحد… وش تبغاه يكون؟",
      level: 2,
      levelTitle: "المستوى الثاني: الجوهر - فهم القيم",
      levelIcon: "Compass"
    },
  
    {
      title: "موقف علّمك حدودك",
      question: "وش موقف خلاك تعرف حدودك فعلاً؟ وكيف تغيّرت بعده؟",
      level: 2,
      levelTitle: "المستوى الثاني: الجوهر - فهم القيم",
      levelIcon: "Compass"
    },
  
    {
      title: "فصل حياتك الآن",
      question: "لو حياتك كتاب… وش عنوان الفصل اللي أنت عايشه الحين؟ وليه هذا العنوان؟",
      level: 2,
      levelTitle: "المستوى الثاني: الجوهر - فهم القيم",
      levelIcon: "Compass"
    },
  
    // Level 3: Sharing Experiences - مشاركة التجارب 💫
  
    {
      title: "ذكرى غالية",
      question: "قل لنا ذكرى غالية عليك… وش اللي يخلّيها ما تروح من بالك؟",
      level: 3,
      levelTitle: "المستوى الثالث: مشاركة التجارب",
      levelIcon: "Sparkles"
    },
  
    {
      title: "لحظة تغيّرت بعدها",
      question: "هل مرّت عليك لحظة/تجربة حسّيت بعدها إنك ما عاد صرت نفس الشخص؟ وش اللي تغيّر؟",
      level: 3,
      levelTitle: "المستوى الثالث: مشاركة التجارب",
      levelIcon: "Sparkles"
    },
  
    {
      title: "فخر ما تتكلم عنه",
      question: "وش إنجاز أنت فخور فيه جدًا… بس نادرًا تتكلم عنه أو أحد ينتبه له؟",
      level: 3,
      levelTitle: "المستوى الثالث: مشاركة التجارب",
      levelIcon: "Sparkles"
    },
  
    {
      title: "فكرة تغيّرت عندك",
      question: "وش فكرة كنت مؤمن فيها زمان… وبعدين تغيّرت نظرتك لها ١٨٠ درجة؟ وش السبب؟",
      level: 3,
      levelTitle: "المستوى الثالث: مشاركة التجارب",
      levelIcon: "Sparkles"
    },
  
    {
      title: "شخص غيّر نظرتك",
      question: "فيه شخص غيّر نظرتك للعلاقات أو الصداقة بشكل كبير؟ وش اللي صار؟",
      level: 3,
      levelTitle: "المستوى الثالث: مشاركة التجارب",
      levelIcon: "Sparkles"
    },
  
    {
      title: "جانب ما يعرفونه كثير",
      question: "شاركنا جانب فيك قليل يعرفونه… بس تحسّه جزء أساسي من شخصيتك.",
      level: 3,
      levelTitle: "المستوى الثالث: مشاركة التجارب",
      levelIcon: "Sparkles"
    },
  
    // Level 4: "What If?" - Exploring Scenarios 🤝
  
    {
      title: "اختبار النوايا",
      question: "لو قلت كلمة بنية طيبة وانفهمت بالعكس… تشرح وتوضح؟ ولا تترك الموقف يعدّي؟ وليه؟",
      level: 4,
      levelTitle: "المستوى الرابع: \"ماذا لو؟\" - استكشاف السيناريوهات",
      levelIcon: "Handshake"
    },
  
    {
      title: "أسلوب الدعم",
      question: "لو صديق قريب يمر بوقت صعب بسبب غلطة… أنت تميل تعطي حلول ونصايح؟ ولا تسمع وتطمن وتخفف؟ وش تفضّل من الطرف الثاني؟",
      level: 4,
      levelTitle: "المستوى الرابع: \"ماذا لو؟\" - استكشاف السيناريوهات",
      levelIcon: "Handshake"
    },
  
    {
      title: "اختلاف على مبدأ",
      question: "لو اكتشفت إن بينك وبين شريك الحوار اختلاف على نقطة مبدئية… هل تمشيها عشان العلاقة طيبة، ولا توقف وتناقشها؟ وليه؟",
      level: 4,
      levelTitle: "المستوى الرابع: \"ماذا لو؟\" - استكشاف السيناريوهات",
      levelIcon: "Handshake"
    },
  
    {
      title: "ليش جمعكم الـAI؟",
      question: "بعد حوارنا… ليه تتوقع النظام/الـAI جمع بينكم؟ وش اللي لاحظته من تشابه أو تكامل بينكم؟",
      level: 4,
      levelTitle: "المستوى الرابع: \"ماذا لو؟\" - استكشاف السيناريوهات",
      levelIcon: "Handshake"
    }
  
  ];
  
  
  
  // Event Questions - Alternative question set that can be selected
  const eventQuestions = [
  
    // Level 0: Quick Connect - Smart Icebreakers ⚡
  
    {
      title: "نوافذ العقل",
      question: "لو عقلك متصفح… كم تبويب (tab) مفتوح الحين؟ وعن إيش أغلبها؟",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    {
      title: "عدة تعديل المزاج",
      question: "وش عدّتك لتعديل المزاج؟ (أغنية/فيلم/نشاط) شي أول ما تسويه يحسّن يومك.",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    {
      title: "نقاش يومي",
      question: "وش نقاش بسيط عندك فيه رأي قوي وما تتنازل عنه؟ (زي الأناناس مع البيتزا، الاتصال ولا الرسايل)",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    {
      title: "طاقة المكان",
      question: "تفضّل قهوة زحمة وحيوية… ولا مكان هادي ورايق زي مكتبة؟ وليه؟",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    {
      title: "أسلوبك بالواتساب",
      question: "بثلاث كلمات… كيف يوصفونك أصحابك في رسايل الواتساب؟",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    {
      title: "مهارة ودّك فيها",
      question: "وش مهارة صغيرة وممتعة ودّك تتعلمها بس دايم تسوّف؟ (تصفير بالأصابع، خفة يد، لغة إشارة…)",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    {
      title: "مضيعة وقت؟",
      question: "وش شي الناس تشوفه ممتع… وأنت تحسّه مضيعة وقت ١٠٠٪؟",
      level: 0,
      levelTitle: "اتصال سريع",
      levelIcon: "Zap"
    },
  
    // Level 1: The Spark - Breaking the Ice 🧊
  
    {
      title: "رحلة غيّرتك",
      question: "سولف لنا عن رحلة/مغامرة—even لو بسيطة—غيّرت فيك شيء. وش تعلّمت منها؟",
      level: 1,
      levelTitle: "المستوى الأول: الشرارة - لكسر الحاجز",
      levelIcon: "Flame"
    },
  
    {
      title: "شخصية تلهمك",
      question: "مين شخصية (حقيقية أو خيالية) تلهمك؟ وش الصفة اللي شدتّك فيها؟",
      level: 1,
      levelTitle: "المستوى الأول: الشرارة - لكسر الحاجز",
      levelIcon: "Flame"
    },
  
    {
      title: "آخر امتنان",
      question: "وش آخر شي حسّيت بامتنان حقيقي تجاهه؟ (شخص/موقف/شي بسيط)",
      level: 1,
      levelTitle: "المستوى الأول: الشرارة - لكسر الحاجز",
      levelIcon: "Flame"
    },
  
    {
      title: "قرار خارج راحتك",
      question: "وش آخر قرار سويته وحسّيت إنه خارج منطقة راحتك؟ وكيف طلعت نتيجته؟",
      level: 1,
      levelTitle: "المستوى الأول: الشرارة - لكسر الحاجز",
      levelIcon: "Flame"
    },
  
    // Level 2: The Core - Understanding Values 🧭
  
    {
      title: "بوصلة قراراتك",
      question: "إذا واجهت قرار صعب… وش اللي يرجّح عندك؟ حدسك، قيمك، نصيحة شخص تثق فيه، ولا التحليل والمنطق؟",
      level: 2,
      levelTitle: "المستوى الثاني: الجوهر - فهم القيم",
      levelIcon: "Compass"
    },
  
    {
      title: "تعريفك للنجاح",
      question: "كيف تعرّف النجاح عندك؟ منصب، راحة بال، علاقات قوية، إنجاز… ولا شي ثاني؟",
      level: 2,
      levelTitle: "المستوى الثاني: الجوهر - فهم القيم",
      levelIcon: "Compass"
    },
  
    {
      title: "أغلى من الفلوس",
      question: "وش أثمن شي بحياتك ما ينشرى بالفلوس؟",
      level: 2,
      levelTitle: "المستوى الثاني: الجوهر - فهم القيم",
      levelIcon: "Compass"
    },
  
    {
      title: "صفة ما تتحمّلها",
      question: "وش صفة إذا شفتها في شخص… يصير صعب عليك تثق فيه أو تكمل علاقتك معه؟",
      level: 2,
      levelTitle: "المستوى الثاني: الجوهر - فهم القيم",
      levelIcon: "Compass"
    },
  
    // Level 3: Sharing Experiences - مشاركة التجارب 💫
  
    {
      title: "حكمت بسرعة",
      question: "اذكر مرة حكمت على شخص/موقف بسرعة… وبعدين اكتشفت إنك كنت غلطان تمامًا.",
      level: 3,
      levelTitle: "المستوى الثالث: مشاركة التجارب",
      levelIcon: "Sparkles"
    },
  
    {
      title: "نصيحة فرقت معك",
      question: "وش أفضل نصيحة سمعتها وطبّقتها… وحسّيت فعلًا إنها غيّرت فيك شيء؟",
      level: 3,
      levelTitle: "المستوى الثالث: مشاركة التجارب",
      levelIcon: "Sparkles"
    },
  
    {
      title: "شجاعة محد انتبه لها",
      question: "متى آخر مرة كنت شجاع—حتى لو ما أحد لاحظ؟ وش كان الموقف؟",
      level: 3,
      levelTitle: "المستوى الثالث: مشاركة التجارب",
      levelIcon: "Sparkles"
    },
  
    {
      title: "شي يروقك دايم",
      question: "وش الشي اللي يرجّع لك الراحة/السعادة مهما كان يومك صعب؟",
      level: 3,
      levelTitle: "المستوى الثالث: مشاركة التجارب",
      levelIcon: "Sparkles"
    },
  
    // Level 4: "What If?" - Exploring Scenarios 🤝
  
    {
      title: "صديق أم حقيقة؟",
      question: "لو شخص قريب منك متحمس لشي (مشروع/فكرة/لبس) وأنت تشوفه مو حلو… تجامله ولا تكون صريح؟ وليه؟",
      level: 4,
      levelTitle: "المستوى الرابع: \"ماذا لو؟\" - استكشاف السيناريوهات",
      levelIcon: "Handshake"
    },
  
    {
      title: "فرصة ثانية",
      question: "لو شخص خذلك قبل ورجع يعتذر ويطلب فرصة ثانية… هل قرارك يعتمد على نوع الغلطة؟ ولا على مكانته عندك؟",
      level: 4,
      levelTitle: "المستوى الرابع: \"ماذا لو؟\" - استكشاف السيناريوهات",
      levelIcon: "Handshake"
    },
  
    {
      title: "يتغير ولا يكتشف نفسه؟",
      question: "برأيك… الشخص يتغير مع الوقت؟ ولا بس يكتشف نفسه الحقيقية أكثر؟ وليه؟",
      level: 4,
      levelTitle: "المستوى الرابع: \"ماذا لو؟\" - استكشاف السيناريوهات",
      levelIcon: "Handshake"
    },
  
    {
      title: "انطباع الذكاء الاصطناعي",
      question: "بناءً على حوارنا، إيش الصفة اللي تتوقع إن الذكاء الاصطناعي ركز عليها لما قرر يجمعكم؟ وهل تتفقون مع هذا التوقع؟",
      level: 4,
      levelTitle: "المستوى الرابع: \"ماذا لو؟\" - استكشاف السيناريوهات",
      levelIcon: "Handshake"
    }
  ];
  
  // Set selection state
  const [promptIndex, setPromptIndex] = useState(0);
  const [activeQuestionSet, setActiveQuestionSet] = useState<'round1' | 'event' | 'set3'>('round1');
  
  // Select the active question set based on state
  const currentQuestions =
    activeQuestionSet === 'event'
      ? eventQuestions
      : activeQuestionSet === 'set3'
        ? round3Questions
        : round1Questions;

  // Safety check: Reset question index if out of bounds when switching question sets
  useEffect(() => {
    if (currentQuestionIndex >= currentQuestions.length) {
      setCurrentQuestionIndex(0);
    }
  }, [activeQuestionSet, currentQuestions.length, currentQuestionIndex]);

  // Add these refs near the top of your component
  const lastRoundRef = useRef<number | null>(null);
  const lastPhaseRef = useRef<string | null>(null);
  const historyIconRef = useRef<HTMLDivElement | null>(null);

  // Helper function to handle logo clicks with confirmation for rounds
  const handleLogoClick = () => {
    // Check if user is in a round (step 6) and show confirmation
    if (step === 6) {
      const confirmed = window.confirm("هل أنت متأكد من أنك تريد العودة إلى الصفحة الرئيسية؟ سيتم فقدان التقدم الحالي.");
      if (!confirmed) return;
    }
    
    // Navigate to front page
    window.location.href = "/";
  };

  // Helper function to handle history icon interactions
  const handleHistoryIconClick = (event: MouseEvent) => {
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
  const handleMouseDown = (e: MouseEvent) => {
    if (!historyBoxRef.current) return;
    
    const rect = historyBoxRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
  };

  const handleMouseMove = (e: globalThis.MouseEvent) => {
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

  // Auto-scroll to compatibility analysis after submitting feedback when result view appears
  useEffect(() => {
    if (modalStep === "result" && isScoreRevealed && compatibilityRef.current && shouldScrollToAnalysisRef.current) {
      // Slight delay to ensure the result view renders before scrolling
      setTimeout(() => {
        compatibilityRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
        // Reset flag so it doesn't auto-scroll on subsequent openings
        shouldScrollToAnalysisRef.current = false;
      }, 150);
    }
  }, [modalStep, isScoreRevealed]);

  // Check auto-signup status when feedback modal is shown
  useEffect(() => {
    const checkAutoSignupStatus = async () => {
      if (modalStep === "feedback" && secureToken) {
        try {
          const response = await fetch("/api/participant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "resolve-token",
              secure_token: secureToken
            }),
          })
          
          const data = await response.json()
          if (response.ok && data) {
            // Sync gender preference with DB value when available
            if (typeof data.gender_preference === 'string' && data.gender_preference.trim()) {
              setReturningGenderPreference(data.gender_preference)
              // preference source: DB only (no localStorage caching)
            }
            if (data.auto_signup_next_event) {
              setAutoSignupEnabled(true)
              console.log('✅ Feedback: Auto-signup is enabled, hiding checkbox')
            } else {
              setAutoSignupEnabled(false)
              console.log('💡 Feedback: Auto-signup not enabled, showing checkbox')
            }
          }
        } catch (error) {
          console.error("Error checking auto-signup status:", error)
        }
      }
    }
    
    checkAutoSignupStatus()
  }, [modalStep, secureToken]);




  // Typewriter effect for welcome message
  useEffect(() => {
    if (step !== -1 || !assignedNumber) {
      setWelcomeText("")
      setWelcomeTyping(false)
      return
    }

    const fullText = `مرحباً بك لاعب رقم ${assignedNumber} في نظام الصداقة الذكي! \n\nستبدأ بجلوس مع مجموعة لمدة 20-30 دقيقة، ثم تنتقل إلى لقاءات فردية مع أشخاص متوافقين لتبادل وجهات النظر المختلفة.`
    
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
      setTypewriterText(personalitySummary)
      setIsTyping(false)
      setTypewriterCompleted(true)
      return
    }

    // Starting typewriter effect
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
        // Typewriter completed
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
        const res = await fetch("/api/participant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve-token", secure_token: token }),
        })
        const data = await res.json()
        
        console.log("Frontend: Token resolution response:", { status: res.status, data });
        
        if (res.ok && data.success) {
          // Token is valid
          setIsTokenValid(true)
          setTokenError(null)
          setAssignedNumber(data.assigned_number);
          setParticipantName(data.name);
          setSecureToken(token); // Store the secure token
          saveUserToken(token, data.name, data.assigned_number); // Save token with name and number to localStorage
          // Update gender preference from DB to keep navbar badge in sync
          if (typeof data.gender_preference === 'string' && data.gender_preference.trim()) {
            setReturningGenderPreference(data.gender_preference)
            // preference source: DB only (no localStorage caching)
          }
          // If URL still has legacy showToken flag, show modal and then clean it from URL
          try {
            const params = new URLSearchParams(window.location.search)
            if (params.get('showToken') === '1') {
              setShowTokenModal(true)
              params.delete('showToken')
              const newQuery = params.toString()
              const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`
              window.history.replaceState(null, '', newUrl)
            }
          } catch (_) {}
          // If we just created a token (no route flag), show modal once and clear flag
          try {
            if (sessionStorage.getItem('justCreatedToken') === '1') {
              const justToken = sessionStorage.getItem('justCreatedTokenValue')
              if (justToken) {
                setSecureToken(justToken)
                saveUserToken(justToken); // Save token to localStorage for auto-fill
              }
              setShowTokenModal(true)
            }
          } catch (_) {}
          // Load history for returning user and show popup
          try {
            if (Array.isArray(data.history) && data.history.length > 0) {
              const mapped = data.history.map((h: any) => ({
                with: h.with,
                type: h.type,
                reason: h.reason,
                round: h.round,
                table_number: h.table_number ?? null,
                score: h.score ?? 0,
                is_repeat_match: !!h.is_repeat_match,
                mutual_match: !!h.mutual_match,
              })) as MatchResultEntry[]
              setHistoryMatches(mapped)
              setShowHistory(true)
            } else {
              setHistoryMatches([])
            }
          } catch (e) {
            console.error("Error mapping history:", e)
          }
          
          // Check if user has filled the survey using new structure
          const hasFilledForm = data.survey_data && data.survey_data.answers && Object.keys(data.survey_data.answers).length > 0;
          
          // Note: Survey completion popup is only shown on main page (not when accessing via token URL)
          // This prevents duplicate popups and ensures clean token URL experience
          
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
          // If we already loaded history above, re-open after reset
          try {
            setTimeout(() => {
              if (historyMatches && historyMatches.length > 0) {
                setShowHistory(true)
              }
            }, 0)
          } catch (_) {}
          setFeedbackAnswers({
            compatibilityRate: 50,
            sliderMoved: false,
            conversationQuality: 3,
            personalConnection: 3,
            sharedInterests: 3,
            comfortLevel: 3,
            communicationStyle: 3,
            wouldMeetAgain: 3,
            overallExperience: 3,
            recommendations: "",
            organizerImpression: "",
            participantMessage: ""
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
            setCurrentRound(eventData.current_round ?? 1);
            setTotalRounds(eventData.total_rounds ?? 4);
            setCurrentEventId(eventData.current_event_id || 1);
            setIsRepeatMatch(false);
            
            // Restore timer state if active (only attempt once per page load)
            if (!timerRestoreAttempted && eventData.global_timer_active && eventData.global_timer_start_time) {
              setTimerRestoreAttempted(true);
              // Restoring timer state on page load
              const startTime = new Date(eventData.global_timer_start_time).getTime();
              const now = new Date().getTime();
              const elapsed = Math.floor((now - startTime) / 1000);
              const remaining = Math.max(0, (eventData.global_timer_duration || 1800) - elapsed);
              
              if (remaining > 0) {
                // Restoring active timer
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

            // --- FORCE ROUND 1 LOGIC ---
            if (forceRound === '1') {
              if (!hasForcedRound1Ref.current) {
                console.log("🔄 Force round 1 view requested");
                hasForcedRound1Ref.current = true;
                setStep(4); // Force round 1 view
                
                // Set a flag in session storage to persist across re-renders
                sessionStorage.setItem('force_round_1', 'true');
              }
              // Skip all other phase logic when force_round=1
              return;
            } else {
              // Clear the flag if force_round is not set
              sessionStorage.removeItem('force_round_1');
            }
            
            if (hasFilledForm) {
              if (eventData.phase !== "form") {
                // Registration closed but user filled form, skip to correct step
                if (eventData.phase && eventData.phase.startsWith("round_")) {
                  const roundNumber = parseInt(eventData.phase.split('_')[1]);
                  setPendingMatchRound(roundNumber);
                  // Ensure we re-check for the active round (in case of mid-flow refresh)
                  hasCheckedMatchRef.current = false;

                  if (isCheckingMatch) return; // Skip if we're already checking

                  try {
                    const ok = await hasValidMatchForRound1(eventData.current_event_id || 1, roundNumber);
                    if (ok) {
                      setStep(4); // Show matches
                    } else {
                      setStep(2); // Keep user in form
                    }
                  } catch (error) {
                    console.error("Error checking match status:", error);
                    setStep(2); // Default to form on error
                  }
                } else if (eventData.phase && eventData.phase.startsWith("waiting_")) {
                  setStep(3); // Show analysis/waiting
                } else if (eventData.phase === "group_phase") {
                  setStep(7); // Show group phase
                  // Fetch group matches when loading in group phase
                  console.log("🎯 Initial load: Fetching group matches for group_phase")
                  fetchGroupMatches();
                } else if (eventData.phase === "waiting") {
                  // User completed form and we're in waiting phase
                  setStep(3); // Show analysis/waiting
                }
              } else {
                // In form phase and already filled form, show prompt (unless user just created token)
                if (!isJustCreatedUser) {
                  setShowFormFilledPrompt(true);
                } else {
                  console.log("🚫 Not showing form filled prompt - user just created token");
                }
              }
            } else {
              // User hasn't filled form yet, check current phase
              if (eventData.phase === "registration") {
                setStep(0); // Show registration step
              } else if (eventData.phase === "form") {
                setStep(2); // Show form
              } else if (eventData.phase === "waiting") {
                setStep(2); // Still show form even in waiting phase if not filled
              } else if (eventData.phase && eventData.phase.startsWith("round_")) {
                // User missed the form phase, show a message or redirect
                setStep(2); // Show form anyway
              }
            }
            
            // Check if event is finished and handle feedback/results on initial load
            if (hasFilledForm && eventData.phase && eventData.phase.startsWith("round_")) {
              const roundNumber = parseInt(eventData.phase.split('_')[1]);
              try {
                const feedbackCheckRes = await fetch("/api/participant", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "check-feedback-submitted",
                    secure_token: token,
                    round: roundNumber,
                    event_id: eventData.current_event_id || 1  // Use fresh value from API, not state
                  }),
                });
                
                const feedbackCheckData = await feedbackCheckRes.json();
                if (feedbackCheckRes.ok && feedbackCheckData.success && feedbackCheckData.event_finished) {
                  console.log("🏁 Initial load: Event is finished, checking feedback status");
                  if (feedbackCheckData.feedback_submitted) {
                    console.log("✅ Initial load: Feedback already submitted, showing results");
                    setModalStep("result");
                    setIsScoreRevealed(true);
                  } else {
                    console.log("📝 Initial load: Feedback not submitted, showing feedback form");
                    setModalStep("feedback");
                    setTimerEnded(true);
                    setIsShowingFinishedEventFeedback(true);
                  }
                }
              } catch (error) {
                console.error("Error checking event finished status on initial load:", error);
              }
            }
            // --- END NEW LOGIC ---
          }
        } else {
          // Token is invalid
          setIsTokenValid(false)
          setTokenError(data.error || "الرابط غير صحيح أو منتهي الصلاحية")
          console.error("Invalid token:", data.error)
          
          // Clear localStorage to allow user to create new account
          console.log("🗑️ Clearing localStorage due to invalid token")
          clearSavedTokens()
        }
      } catch (err) {
        console.error("Error resolving token:", err)
        setIsTokenValid(false)
        setTokenError("حدث خطأ في التحقق من الرابط. يرجى المحاولة مرة أخرى.")
        
        // Clear localStorage to allow user to create new account
        console.log("🗑️ Clearing localStorage due to token resolution error")
        clearSavedTokens()
      } finally {
        setIsResolving(false)
      }
    }
    resolveToken()
  }, [token])

  // Auto-open survey when redirected for redo: /welcome?token=...&redo=1 or flow=redo
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (isResolving) return;
      if (redoHandled) return;
      const params = new URLSearchParams(window.location.search);
      const redoParam = params.get('redo');
      const flowParam = params.get('flow');
      const isRedo = (redoParam === '1' || redoParam === 'true' || flowParam === 'redo');
      if (token && isRedo) {
        setRedoHandled(true);
        setStep(2);
        // Emulate clicking "إعادة تعبئة النموذج" directly
        setFormFilledChoiceMade(true);
        setShowFormFilledPrompt(false);
        setAnalysisStarted(false);

        // Restore previous answers exactly like the manual redo button
        (async () => {
          try {
            const tokenToUse = token || secureToken;
            if (!hasSubstantialSurveyData(surveyData.answers) && tokenToUse) {
              const userRes = await fetch("/api/participant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "resolve-token", secure_token: tokenToUse }),
              });
              const userData = await userRes.json();
              if (userData.success && userData.survey_data) {
                if (userData.assigned_number && !assignedNumber) {
                  setAssignedNumber(userData.assigned_number);
                }
                if (userData.name && !participantName) {
                  setParticipantName(userData.name);
                }
                const formattedSurveyData = {
                  answers: userData.survey_data.answers || {},
                  termsAccepted: userData.survey_data.termsAccepted || false,
                  dataConsent: userData.survey_data.dataConsent || false,
                  ...userData.survey_data,
                };
                setSurveyData(formattedSurveyData);
              }
            }
          } catch (err) {
            console.error("Failed to load existing survey data during auto-redo:", err);
          } finally {
            // Show survey and enable editing after attempting to load
            setShowSurvey(true);
            setTimeout(() => setIsEditingSurvey(true), 100);
          }
        })();
        // Clean URL but keep token query param
        params.delete('redo');
        params.delete('flow');
        const newQuery = params.toString();
        const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : `?token=${encodeURIComponent(token)}`}`;
        window.history.replaceState(null, '', newUrl);
      }
    } catch (e) {
      console.error('Failed to process redo params:', e);
    }
  }, [isResolving, token, redoHandled]);

  // Handle /welcome?token=...&disableauto to disable auto-signup for this token
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (disableAutoHandled) return;

      const params = new URLSearchParams(window.location.search);
      // Only trigger when the key exists AND value is one of '', '1', 'true'
      if (!params.has('disableauto')) return;
      const disableVal = (params.get('disableauto') ?? '').toLowerCase();
      const isDisableRequested = disableVal === '' || disableVal === '1' || disableVal === 'true';
      if (!isDisableRequested) return;

      // Determine token to use: prefer URL token, then in-memory, then localStorage
      const urlToken = token;
      const localToken =
        secureToken ||
        resultToken ||
        returningPlayerToken ||
        localStorage.getItem('blindmatch_result_token') ||
        localStorage.getItem('blindmatch_returning_token');
      const tokenToUse = urlToken || localToken || '';

      if (!tokenToUse) {
        // No token available; clean the param and inform user
        params.delete('disableauto');
        const newQuery = params.toString();
        const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
        window.history.replaceState(null, '', newUrl);
        toast.error('لا يمكن إيقاف التسجيل التلقائي بدون رمز صحيح');
        setDisableAutoHandled(true);
        return;
      }

      // Ask for confirmation before disabling
      const confirmed = window.confirm('هل تريد إيقاف التسجيل التلقائي لجميع الفعاليات القادمة لهذا الحساب؟\nيمكنك إعادة تفعيله لاحقاً من داخل الصفحة.');
      if (!confirmed) {
        // Clean the URL param and exit
        const p = new URLSearchParams(window.location.search);
        p.delete('disableauto');
        const newQuery = p.toString();
        const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
        window.history.replaceState(null, '', newUrl);
        toast('لم يتم إجراء أي تغيير');
        setDisableAutoHandled(true);
        return;
      }

      (async () => {
        try {
          const res = await fetch('/api/participant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'disable-auto-signup', secure_token: tokenToUse })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            setAutoSignupEnabled(false);
            toast.success('تم إيقاف التسجيل التلقائي للأحداث القادمة');
          } else {
            toast.error(data.error || 'فشل إيقاف التسجيل التلقائي');
          }
        } catch (err) {
          console.error('Error disabling auto-signup via URL param:', err);
          toast.error('حدث خطأ أثناء إيقاف التسجيل التلقائي');
        } finally {
          // Clean the URL param regardless of outcome
          const p = new URLSearchParams(window.location.search);
          p.delete('disableauto');
          const newQuery = p.toString();
          const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
          window.history.replaceState(null, '', newUrl);
          setDisableAutoHandled(true);
        }
      })();
    } catch (e) {
      console.error('Failed to process disableauto param:', e);
    }
  }, [token, secureToken, resultToken, returningPlayerToken, disableAutoHandled]);

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
    // Poll for all steps except:
    // - initial welcome screen (step -1)
    // - registration (step 0)
    // - survey/editing (step 2)
    if (isResolving || step === -1 || step === 0 || step === 2) return
    // Don't transition steps while success modal is visible
    if (showSurveySuccessModal) return
    // Suppress polling transitions for a short time after submit to avoid bouncing back to survey
    if (suppressPollingUntil && Date.now() < suppressPollingUntil) {
      return
    }
    
    // If force_round is set, don't let phase changes affect the view
    if (forceRound === '1') return

    // Shared polling function that can be called on-demand or via interval
    const pollEventState = async () => {
      try {
        // Polling for updates...
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
        
        // Only update state if values actually changed (prevents unnecessary re-renders)
        const newPhase = data.phase || "registration"
        if (newPhase !== phase) {
          setPhase(newPhase)
        }
        
        const newEventId = data.current_event_id || 1
        if (newEventId !== currentEventId) {
          console.log(`🔄 Event ID changed: ${currentEventId} → ${newEventId}`)
          setCurrentEventId(newEventId)
        }
        
        // Only update announcement if it changed
        const newAnnouncement = {
          message: data.announcement,
          type: data.announcement_type,
          time: data.announcement_time
        }
        if (JSON.stringify(newAnnouncement) !== JSON.stringify(announcement)) {
          setAnnouncement(newAnnouncement)
        }
        
        // Only update emergency pause if it changed
        const newEmergencyPaused = data.emergency_paused || false
        if (newEmergencyPaused !== emergencyPaused) {
          setEmergencyPaused(newEmergencyPaused)
        }
        
        // Handle global timer state with improved synchronization
        // Received timer data
        
        // Handle timer state updates
        // We need to handle both active timers and timer end scenarios
        const hasActiveTimer = data.global_timer_active && data.global_timer_start_time;
        const shouldUpdateActiveTimer = (!timerRestored || hasActiveTimer) && data.global_timer_start_time;
        
        // Timer state debug
        
        // Handle active timer updates
        if (shouldUpdateActiveTimer) {
          if (data.global_timer_active && data.global_timer_start_time) {
            const startTime = new Date(data.global_timer_start_time).getTime()
            const now = new Date().getTime()
            const elapsed = Math.floor((now - startTime) / 1000)
            const remaining = Math.max(0, (data.global_timer_duration || 1800) - elapsed)
            
            // Global timer data
            
            if (remaining > 0) {
              if (!globalTimerActive) {
                // Global timer detected - batch state updates
                setGlobalTimerActive(true)
                setConversationStarted(true)
                setTimerEnded(false)
                setModalStep(null) // Clear any existing modal
              }
              // Only update timer values if they changed
              if (globalTimerStartTime !== data.global_timer_start_time) {
                setGlobalTimerStartTime(data.global_timer_start_time)
              }
              const newDuration = data.global_timer_duration || 1800
              if (globalTimerDuration !== newDuration) {
                setGlobalTimerDuration(newDuration)
              }
              // Always update remaining time (it changes every second)
              setConversationTimer(remaining)
            } else {
              // Timer expired
              if (globalTimerActive) {
                // Global timer expired, showing feedback
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
          setCurrentRound(data.current_round ?? 1);
          setTotalRounds(data.total_rounds ?? 4);
          setIsRepeatMatch(false);
          
          console.log(`🔄 Polling detected phase: ${data.phase}, current step: ${step}`);
          
          // NO AUTOMATIC DATA LOADING - Users must explicitly click buttons to load their data
          
          // HANDLE ALL PHASE TRANSITIONS
          console.log(`🔄 Phase transition check: current phase=${data.phase}, lastPhaseRef=${lastPhaseRef.current}, lastRoundRef=${lastRoundRef.current}, step=${step}`);
          
          if (data.phase && data.phase.startsWith("round_")) {
            // Round phases: round_1 (same-gender) and round_2 (opposite-gender)
            const roundNumber = parseInt(data.phase.split('_')[1]);
            // Handle Round 1 and Round 2
            if ((roundNumber === 1 || roundNumber === 2) && (lastRoundRef.current !== roundNumber || lastPhaseRef.current !== data.phase)) {
              console.log(`🔄 Round phase change detected: ${lastPhaseRef.current} → ${data.phase} (Round ${lastRoundRef.current} → ${roundNumber})`);

              // Reset valid-match check cache so we re-verify per round
              hasCheckedMatchRef.current = false;

              await fetchMatches(roundNumber);

              if (isCheckingMatch) return; // Skip if we're already checking
              
              try {
                const ok = await hasValidMatchForRound1(currentEventId || 1, roundNumber);
                if (ok) {
                  setStep(4);
                } else {
                  setStep(2);
                }
              } catch (error) {
                console.error("Error checking match status during phase change:", error);
                setStep(2); // Default to form on error
              }
              
              // Check if event is finished and handle feedback/results automatically
              if (secureToken && currentRound) {
                try {
                  const feedbackCheckRes = await fetch("/api/participant", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "check-feedback-submitted",
                      secure_token: secureToken,
                      round: currentRound,
                      event_id: currentEventId || 1
                    }),
                  });
                  
                  const feedbackCheckData = await feedbackCheckRes.json();
                  if (feedbackCheckRes.ok && feedbackCheckData.success) {
                    if (feedbackCheckData.event_finished) {
                      console.log("🏁 Event is finished, checking feedback status");
                      if (feedbackCheckData.feedback_submitted) {
                        console.log("✅ Feedback already submitted, showing results");
                        setModalStep("result");
                        setIsScoreRevealed(true);
                      } else {
                        console.log("📝 Feedback not submitted, showing feedback form");
                        setModalStep("feedback");
                        setTimerEnded(true);
                        setIsShowingFinishedEventFeedback(true);
                      }
                    }
                  }
                } catch (error) {
                  console.error("Error checking event finished status:", error);
                }
              }
              
              // Reset all states for clean transition (but preserve global timer state and event finished modal)
              // Skip all resets if we're showing results or feedback for a finished event
              const isShowingFinishedEventResults = modalStep === "result" && isScoreRevealed;
              // Use dedicated state variable to track finished event feedback
              
              if (!globalTimerActive && !timerRestored && !isShowingFinishedEventResults && !isShowingFinishedEventFeedback) {
                setConversationTimer(1800);
                setConversationStarted(false);
                setModalStep(null);
                setIsScoreRevealed(false);
                setIsShowingFinishedEventFeedback(false);
                setShowConversationStarters(false);
                setConversationStarters([]);
                setGeneratingStarters(false);
                setShowHistory(false);
                setShowHistoryDetail(false);
                setSelectedHistoryItem(null);
                setAnimationStep(0);
                          setFeedbackAnswers({
              compatibilityRate: 50,
              sliderMoved: false,
              conversationQuality: 3,
              personalConnection: 3,
              sharedInterests: 3,
              comfortLevel: 3,
              communicationStyle: 3,
              wouldMeetAgain: 3,
              overallExperience: 3,
              recommendations: "",
              organizerImpression: "",
              participantMessage: ""
            });
                setTypewriterCompleted(false);
                setTimerEnded(false);
                setIsRepeatMatch(false);
                setPartnerStartedTimer(false);
                setPartnerEndedTimer(false);
              } else {
                console.log("🔄 Skipping state reset - global timer active, timer restored, or showing finished event results/feedback");
              }
              
              lastRoundRef.current = roundNumber;
              lastPhaseRef.current = data.phase;
              
              // Show Round 1 guide popup
              if (roundNumber === 1) {
                setShowRound1Guide(true);
              }
              
              console.log(`✅ Successfully transitioned to ${data.phase}`);
            }
        } else if (data.phase && data.phase.startsWith("waiting_")) {
            // Waiting phases (waiting only - single round mode)
            console.log(`🔄 Waiting phase change detected: ${data.phase} (from step ${step})`);
            setStep(5);
            // Skip all resets if we're showing results or feedback for a finished event
            const isShowingFinishedEventResults = modalStep === "result" && isScoreRevealed;
            
            // Only reset timer if not in global timer mode and not showing finished event results/feedback
            if (!globalTimerActive && !timerRestored && !isShowingFinishedEventResults && !isShowingFinishedEventFeedback) {
              setConversationStarted(false);
              setModalStep(null);
              setTimerEnded(false);
              setIsShowingFinishedEventFeedback(false);
              setPartnerStartedTimer(false);
              setPartnerEndedTimer(false);
              setIsScoreRevealed(false);
              setShowConversationStarters(false);
              setConversationStarters([]);
              setGeneratingStarters(false);
            } else {
              console.log("🔄 Skipping timer reset in waiting phase - global timer active, timer restored, or showing finished event results/feedback");
            }
            
            // Update refs for waiting phase
            const waitingRound = parseInt(data.phase.split('_')[1]);
            lastRoundRef.current = waitingRound;
            lastPhaseRef.current = data.phase;
            
            console.log(`✅ Successfully transitioned to ${data.phase}`);
          } else if (data.phase === "group_phase") {
            // Group phase
            if (lastPhaseRef.current !== "group_phase") {
              console.log(`🔄 Group phase change detected: ${lastPhaseRef.current} → group_phase (from step ${step})`);
              setStep(7);
              if (!globalTimerActive && !timerRestored) {
                setConversationTimer(1800);
                setConversationStarted(false);
                setModalStep(null);
                setIsScoreRevealed(false);
                setTimerEnded(false);
                setPartnerStartedTimer(false);
                setPartnerEndedTimer(false);
                setShowConversationStarters(false);
                setConversationStarters([]);
                setGeneratingStarters(false);
                setShowHistory(false);
                setShowHistoryDetail(false);
                setSelectedHistoryItem(null);
                setAnimationStep(0);
              } else {
                console.log("🔄 Skipping timer reset in group phase - global timer active or timer was restored");
              }
              await fetchGroupMatches();
              lastPhaseRef.current = "group_phase";
              lastRoundRef.current = 0;
              console.log(`✅ Successfully transitioned to group_phase`);
            }
          } else if (data.phase === "waiting") {
            // General waiting phase
            console.log(`🔄 General waiting phase change detected (from step ${step})`);
            setStep(3);
            // Skip all resets if we're showing results or feedback for a finished event
            const isShowingFinishedEventResults = modalStep === "result" && isScoreRevealed;
            
            // Only reset timer if not in global timer mode and not showing finished event results/feedback
            if (!globalTimerActive && !timerRestored && !isShowingFinishedEventResults && !isShowingFinishedEventFeedback) {
              setConversationStarted(false);
              setModalStep(null);
              setTimerEnded(false);
              setIsShowingFinishedEventFeedback(false);
              setPartnerStartedTimer(false);
              setPartnerEndedTimer(false);
              setIsScoreRevealed(false);
              setShowConversationStarters(false);
              setConversationStarters([]);
              setGeneratingStarters(false);
            } else {
              console.log("🔄 Skipping timer reset in general waiting phase - global timer active, timer restored, or showing finished event results/feedback");
            }
            console.log(`✅ Successfully transitioned to waiting`);
                  } else if (data.phase === "form") {
            // Form phase
            console.log(`🔄 Form phase change detected (from step ${step})`);
            
            if (step === (-1 as number)) {
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
                // Skip all resets if we're showing results or feedback for a finished event
                const isShowingFinishedEventResults = modalStep === "result" && isScoreRevealed;
            
                // Only reset timer if not in global timer mode and not showing finished event results/feedback
                if (!globalTimerActive && !timerRestored && !isShowingFinishedEventResults && !isShowingFinishedEventFeedback) {
                  setConversationStarted(false);
                  setModalStep(null);
                  setTimerEnded(false);
                  setIsShowingFinishedEventFeedback(false);
                  setPartnerStartedTimer(false);
                  setPartnerEndedTimer(false);
                  setIsScoreRevealed(false);
                  setShowConversationStarters(false);
                  setConversationStarters([]);
                  setGeneratingStarters(false);
                } else {
                  console.log("🔄 Skipping timer reset in form phase - global timer active, timer restored, or showing finished event results/feedback");
                }
                // Reset form filled choice when returning to form phase from other phases
                // But don't reset if user just completed editing to prevent popup loop
                if (!justCompletedEditing) {
                  setFormFilledChoiceMade(false);
                  console.log("🔄 Reset formFilledChoiceMade when returning to form phase");
                } else {
                  console.log("🚫 Not resetting formFilledChoiceMade - user just completed editing");
                }
              } else {
                console.log("🔄 User has already made their choice, staying on current step");
              }
            }
          
          // Handle form filled prompt logic - only show if user hasn't made a choice yet
          // This prevents the prompt from appearing repeatedly after user makes their choice
          // Also prevent showing if user just completed editing their survey
          // IMPORTANT: Only show popup after token validation is completed to ensure participant still exists
          // Don't show if user just created their token (new user in middle of registration)
          if (hasSubstantialSurveyData(surveyData.answers) && !formFilledChoiceMade && !justCompletedEditing && !isJustCreatedUser && tokenValidationCompleted) {
            if (!showFormFilledPrompt && step === (2 as number)) {
              console.log("🔔 Showing form filled prompt - user has survey data but hasn't made choice")
              setShowFormFilledPrompt(true);
            }
          } else {
            if (justCompletedEditing) {
              console.log("🚫 Not showing form filled prompt - user just completed editing")
            } else if (isJustCreatedUser) {
              console.log("🚫 Not showing form filled prompt - user just created token")
            } else if (!tokenValidationCompleted) {
              console.log("🚫 Not showing form filled prompt - token validation not completed yet")
            }
            setShowFormFilledPrompt(false);
          }
            console.log(`✅ Successfully transitioned to form phase`);
          } else if (data.phase === "registration") {
            // Registration phase
            if (step > 0) {
              console.log(`🔄 Registration phase change detected (from step ${step})`);
              setStep(0);
              // Skip all resets if we're showing results or feedback for a finished event
              const isShowingFinishedEventResults = modalStep === "result" && isScoreRevealed;
              
              // Only reset timer if not in global timer mode and not showing finished event results/feedback
              if (!globalTimerActive && !timerRestored && !isShowingFinishedEventResults && !isShowingFinishedEventFeedback) {
                setConversationStarted(false);
                setModalStep(null);
                setTimerEnded(false);
                setIsShowingFinishedEventFeedback(false);
                setPartnerStartedTimer(false);
                setPartnerEndedTimer(false);
              } else {
                console.log("🔄 Skipping timer reset in registration phase - global timer active, timer restored, or showing finished event results/feedback");
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
    }

    // Start regular polling interval
    const interval = setInterval(pollEventState, 2000) // Poll every 2 seconds
    
    // Also poll immediately on mount
    pollEventState()

    // Page Visibility API: Force sync when user returns to the page
    // This handles cases when:
    // - Screen is locked/unlocked
    // - Browser tab is switched away and back
    // - Mobile device screen turns off/on
    // - Computer goes to sleep and wakes up
    // When any of these happen, JavaScript timers can be throttled or paused,
    // causing the UI to become out of sync. This forces an immediate sync when
    // the user returns to the page.
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log("👁️ Page became visible - forcing immediate sync to catch up with server state")
        pollEventState() // Immediate sync when page becomes visible again
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
  
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [step, currentRound, assignedNumber, isResolving, globalTimerActive, phase, currentEventId, announcement, emergencyPaused, timerRestored, globalTimerStartTime, globalTimerDuration, conversationStarted, modalStep, isScoreRevealed, isShowingFinishedEventFeedback, secureToken, formFilledChoiceMade, justCompletedEditing, tokenValidationCompleted, surveyData, showFormFilledPrompt, isJustCreatedUser, suppressPollingUntil, showSurveySuccessModal])

  // Round 1 Local Timer - counts down from 45 minutes
  // Track if timer has ever started to keep it running even after global timer ends
  const [round1TimerStarted, setRound1TimerStarted] = useState(false)
  
  useEffect(() => {
    // Start tracking when conversation begins
    if (step === 4 && currentRound === 1 && conversationStarted) {
      setRound1TimerStarted(true)
    }
    // Reset when leaving Round 1 (but not when just showing feedback)
    if ((step !== 4 && step !== 5) || currentRound !== 1) {
      setRound1TimerStarted(false)
      setRound1LocalTimer(2700)
    }
  }, [step, currentRound, conversationStarted])
  
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    
    // Keep timer running once started, even if global timer ends or showing feedback
    if ((step === 4 || step === 5) && currentRound === 1 && round1TimerStarted) {
      interval = setInterval(() => {
        setRound1LocalTimer(prev => {
          if (prev <= 0) return 0
          
          // Show 5-minute warning when exactly 5 minutes remain
          if (prev === 300 && !showFiveMinuteWarning) {
            setShowFiveMinuteWarning(true)
          }
          
          return prev - 1
        })
      }, 1000)
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [step, currentRound, round1TimerStarted, showFiveMinuteWarning])

  // Track time spent on current question and show gentle nudge
  useEffect(() => {
    // Reset timer when question changes
    setQuestionStartTime(Date.now())
    setTimeOnCurrentQuestion(0)
    setShowPaceNudge(false)
  }, [currentQuestionIndex])

  useEffect(() => {
    // Only track during Round 1 conversation phase
    if (step !== 4 || currentRound !== 1) {
      return
    }

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - questionStartTime) / 1000)
      setTimeOnCurrentQuestion(elapsed)

      // Show nudge if:
      // 1. Spending more than 5 minutes on one question (300 seconds)
      // 2. Still have 10+ questions remaining
      const remainingQuestions = currentQuestions.length - currentQuestionIndex - 1
      if (elapsed >= 300 && remainingQuestions > 10 && !showPaceNudge) {
        setShowPaceNudge(true)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [step, currentRound, questionStartTime, currentQuestionIndex, showPaceNudge])

  const next = () => setStep((s) => Math.min(s + 1, 6))

  // Helper function to render level icon
  const renderLevelIcon = (iconName: string) => {
    const iconProps = { className: "w-4 h-4 text-white" }
    switch (iconName) {
      case "Zap":
        return <Zap {...iconProps} />
      case "Flame":
        return <Flame {...iconProps} />
      case "Compass":
        return <Compass {...iconProps} />
      case "Sparkles":
        return <Sparkles {...iconProps} />
      case "Handshake":
        return <Handshake {...iconProps} />
      default:
        return <Layers {...iconProps} />
    }
  }
  
  // Check if user needs SURVEY RECOVERY (technical data loss):
  // Condition: has interaction fields (humor/openness) BUT missing name or survey_data answers
  const checkSurveyRecovery = async (tokenToCheck: string) => {
    try {
      // Avoid conflicts with other high-priority popups
      if (showSurveyRecoveryPopup || showNewUserTypePopup || showReturningSignupPopup || showSurveyCompletionPopup) {
        return;
      }
      if (window.location.search.includes('?token')) {
        // Skip immediate popup when explicitly visiting with a token URL
        return;
      }

      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "Pragma": "no-cache" },
        body: JSON.stringify({ action: "resolve-token", secure_token: tokenToCheck })
      })
      const data = await res.json()
      if (!res.ok || !data?.success) return

      const hasHumorStyle = !!data.humor_banter_style
      const hasOpenness = data.early_openness_comfort === 0 || data.early_openness_comfort === 1 || data.early_openness_comfort === 2 || data.early_openness_comfort === 3
      const missingName = !data.name || String(data.name).trim().length === 0
      const missingSurvey = !data.survey_data || !data.survey_data.answers || Object.keys(data.survey_data.answers || {}).length === 0

      if ((hasHumorStyle || hasOpenness) && (missingName || missingSurvey)) {
        // Technical loss detected – ask user to refill survey
        setSurveyRecoveryInfo({
          assigned_number: data.assigned_number,
          secure_token: tokenToCheck,
          name: data.name || undefined
        })
        setShowSurveyRecoveryPopup(true)
      }
    } catch (err) {
      console.error("Error checking survey recovery state:", err)
    }
  }

  // Unified Navigation Bar for saved users (similar to groups page)
  const NavigationBar = () => {
    // Show for users with saved tokens or assigned numbers
    // Check localStorage safely (client-side only)
    const hasStoredResultToken = typeof window !== 'undefined' ? localStorage.getItem('blindmatch_result_token') : null;
    const hasStoredReturningToken = typeof window !== 'undefined' ? localStorage.getItem('blindmatch_returning_token') : null;
    
    if ((!token && !showRegistrationContent) || (!assignedNumber && !resultToken && !returningPlayerToken && !hasStoredResultToken && !hasStoredReturningToken)) {
      return null;
    }
    
    // Use relative positioning when accessing via token URL AND in round phase, fixed otherwise
    const isTokenAndRoundPhase = token && phase === "round_1";
    const positionClass = isTokenAndRoundPhase 
      ? "relative top-0 left-1/2 transform -translate-x-1/2 z-[100]" 
      : "fixed top-4 left-1/2 transform -translate-x-1/2 z-[100]";
    
    // Check if user is signed up for next event but hasn't enabled auto-signup
    const showAutoSignupOffer = showNextEventSignup && !autoSignupEnabled;
    
    // Debug: Log the button visibility logic
    if (assignedNumber || resultToken || returningPlayerToken || hasStoredResultToken || hasStoredReturningToken) {
      console.log('🔍 NavigationBar Auto-Signup Button Check:', {
        showNextEventSignup,
        autoSignupEnabled,
        showAutoSignupOffer,
        isTokenAndRoundPhase,
        willShowButton: showAutoSignupOffer && !isTokenAndRoundPhase
      });
    }
    
    return (
      <div className={positionClass}>
        <div className="flex flex-col items-center gap-2">
          <div className="bg-gradient-to-r from-slate-800/40 to-slate-700/40 rounded-full px-3 py-1 border border-slate-600/50 shadow-md backdrop-blur-sm">
            <div className="flex items-center gap-3">
            {/* Logo - Center */}
            <div 
              onClick={handleLogoClick}
              className="cursor-pointer transition-all duration-200 hover:opacity-80"
            >
              <div className="w-[28px] h-[28px] min-w-[28px] min-h-[28px] rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 p-[5px] shadow-lg ring-1 ring-white/10">
                <Home className="w-full h-full text-white" strokeWidth={2.5} />
              </div>
            </div>

            {/* Participant Infoo */}
            {assignedNumber && (
              <>
                <div className="w-px h-4 bg-slate-600"></div>
                <div className="flex items-center gap-1.5">
                  <div className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent font-bold text-sm">
                    #{assignedNumber}
                  </div>
                  {participantName && (
                    <span className="text-white/90 text-sm font-medium whitespace-nowrap">
                      {participantName}
                    </span>
                  )}
                </div>
              </>
            )}

            {/* Auto-Signup Offer Button - Show for users signed up for next event but auto-signup disabled */}
            {showAutoSignupOffer && !isTokenAndRoundPhase && (
              <>
                <div className="w-px h-4 bg-slate-600"></div>
                <button
                  onClick={async () => {
                    const token = resultToken || returningPlayerToken || hasStoredResultToken || hasStoredReturningToken;
                    if (!token) return;
                    
                    try {
                      const res = await fetch("/api/participant", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ 
                          action: "enable-auto-signup",
                          secure_token: token
                        }),
                      });
                      
                      if (res.ok) {
                        setAutoSignupEnabled(true);
                        toast.success("تم تفعيل التسجيل التلقائي لجميع الأحداث القادمة!");
                      }
                    } catch (err) {
                      console.error("Error enabling auto-signup:", err);
                    }
                  }}
                  className="bg-gradient-to-r from-emerald-500/30 to-green-500/30 border-2 border-emerald-400/50 rounded-full px-3 py-1.5 text-[10px] font-bold text-emerald-200 hover:from-emerald-500/40 hover:to-green-500/40 hover:border-emerald-300/70 hover:scale-105 transition-all duration-300 flex items-center gap-1.5 group shadow-lg shadow-emerald-500/20"
                  title="فعّل التسجيل التلقائي لجميع الأحداث القادمة"
                >
                  <Sparkles className="w-3.5 h-3.5 group-hover:animate-pulse text-emerald-300" />
                  <span className="hidden md:inline">تسجيل تلقائي للفعاليات القادمة</span>
                  <span className="md:hidden">تسجيل تلقائي</span>
                </button>
              </>
            )}

            {/* Global Timer - Show only when accessing via token URL AND in round phase */}
            {isTokenAndRoundPhase && (
              <>
                <div className="w-px h-4 bg-slate-600"></div>
                <div className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-400/30 rounded-full px-3 py-1.5 text-xs font-medium text-blue-300 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  <span className="font-mono">
                    {!conversationStarted 
                      ? "انتظار" 
                      : conversationTimer <= 0 
                        ? "انتهى!" 
                        : `${Math.floor(conversationTimer / 60)}:${(conversationTimer % 60).toString().padStart(2, '0')}`
                    }
                  </span>
                </div>
              </>
            )}

            {/* Contact Button - Hide when accessing via token URL AND in round phase */}
            {!isTokenAndRoundPhase && (
              <>
                <div className="w-px h-4 bg-slate-600"></div>
                <button
                  onClick={() => setShowContactForm(true)}
                  className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 rounded-full px-3 py-1.5 text-xs font-medium text-cyan-300 hover:from-cyan-500/30 hover:to-blue-500/30 transition-all duration-300 flex items-center gap-1"
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>تواصل</span>
                </button>
              </>
            )}
            </div>
          </div>
          {showRegistrationContent && secureToken && (
            <button
              onClick={() => {
                window.location.href = `/welcome?token=${secureToken}&flow=returning`
              }}
              className="inline-flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer border border-gray-200 dark:border-slate-700 group"
            >
              <span className={`text-[10px] font-medium ${dark ? 'text-slate-300' : 'text-gray-700'}`}>التفضيل الحالي:</span>
              <span className={`text-[10px] font-bold ${dark ? 'text-blue-400' : 'text-blue-600'}`}>
                {returningGenderPreference === 'same_gender'
                  ? 'نفس الجنس'
                  : returningGenderPreference === 'any_gender'
                    ? 'أي جنس'
                    : returningGenderPreference === 'opposite_gender'
                      ? 'الجنس الآخر'
                      : '...'}
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 group-hover:text-blue-500 transition-colors duration-300">(تغيير)</span>
            </button>
          )}
        </div>
      </div>
    );
  };


  // Reusable Logo Component for non-saved users
  const LogoHeader = () => {
    // Hide logo during loading screen and if NavigationBar is showing
    if (!token && !showRegistrationContent) {
      return null;
    }
    
    // cCheck localStorage safely (client-side only)
    const hasStoredResultToken = typeof window !== 'undefined' ? localStorage.getItem('blindmatch_result_token') : null;
    const hasStoredReturningToken = typeof window !== 'undefined' ? localStorage.getItem('blindmatch_returning_token') : null;
    
    // Hide if user has saved tokens (NavigationBar will show instead)
    if (assignedNumber || resultToken || returningPlayerToken || hasStoredResultToken || hasStoredReturningToken) {
      return null;
    }
    
    // Use relative positioning in round mode (step 4), fixed otherwise
    const positionClass = step === 4 
      ? "relative top-0 right-2 sm:right-3 md:right-4 z-[100]" 
      : "fixed top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 z-[100]";
    
    return (
    <div className={positionClass}>
      <div className="flex flex-col items-end gap-2">
        {/* Logo */}
        <div 
          onClick={handleLogoClick}
          className="group cursor-pointer transition-all duration-700 ease-out hover:scale-105"
        >
          <div className="relative">
            {/* Glow effect background */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-cyan-500/20 rounded-lg blur-md opacity-60 group-hover:opacity-80 transition-opacity duration-1000 ease-in-out"></div>
            
            {/* Main logo container */}
            <div className="relative bg-gradient-to-br from-slate-800/90 via-slate-700/90 to-slate-800/90 backdrop-blur-xl border border-white/10 rounded-lg p-2 shadow-lg group-hover:shadow-purple-500/20 transition-all duration-700 ease-out">
              <div className="w-8 h-8 rounded-md bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 p-1.5 shadow-md ring-1 ring-white/10">
                <Home className="w-full h-full text-white" strokeWidth={2.5} />
              </div>
            </div>
            
            {/* Subtle animated border */}
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-purple-500/30 via-blue-500/30 to-cyan-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 ease-in-out"></div>
          </div>
        </div>

      </div>
    </div>
    );
  };

  // Bottom Left Contact Button Component - shows on pre-registration page
  const BottomLeftContactButton = () => {
    // Check localStorage safely (client-side only)
    const hasStoredResultToken = typeof window !== 'undefined' ? localStorage.getItem('blindmatch_result_token') : null;
    const hasStoredReturningToken = typeof window !== 'undefined' ? localStorage.getItem('blindmatch_returning_token') : null;
    
    // Hide if user has token or saved tokens (NavigationBar will show contact button instead)
    if (token || !showRegistrationContent || assignedNumber || resultToken || returningPlayerToken || hasStoredResultToken || hasStoredReturningToken) {
      return null;
    }
    
    // Use relative positioning in round mode (step 4), fixed otherwise
    const positionClass = step === 4 
      ? "relative bottom-0 left-4 z-[100]" 
      : "fixed bottom-4 left-4 z-[100]";
    
    return (
      <div className={positionClass}>
        <button
          onClick={() => setShowContactForm(true)}
          className="group relative bg-gradient-to-br from-purple-600/90 via-purple-700/90 to-pink-600/90 backdrop-blur-xl border border-purple-400/20 rounded-xl px-4 py-3 shadow-lg hover:shadow-purple-500/25 transition-all duration-500 ease-out hover:scale-105 hover:-translate-y-1"
          title="تواصل معنا"
        >
          {/* Glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-purple-500/20 rounded-xl blur-sm opacity-60 group-hover:opacity-80 transition-opacity duration-700"></div>
          
          {/* Floating animation */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-400/10 via-pink-400/10 to-purple-400/10 animate-pulse"></div>
          
          {/* Icon and Text */}
          <div className="relative flex items-center gap-2" dir="rtl">
            <MessageCircle className="w-5 h-5 text-white drop-shadow-sm animate-bounce" style={{ animationDuration: '2s' }} />
            <span className="text-white text-sm font-medium drop-shadow-sm">
              تواصل معنا
            </span>
          </div>
          
          {/* Animated border */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/30 via-pink-500/30 to-purple-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
        </button>
      </div>
    );
  };

  // Participant Icon Component - shows when user has saved token (but NavigationBar is not showing)
  const ParticipantIcon = () => {
    // Check localStorage safely (client-side only)
    const hasStoredResultToken = typeof window !== 'undefined' ? localStorage.getItem('blindmatch_result_token') : null;
    const hasStoredReturningToken = typeof window !== 'undefined' ? localStorage.getItem('blindmatch_returning_token') : null;
    
    // Hide if NavigationBar should be showing instead
    if (assignedNumber || resultToken || returningPlayerToken || hasStoredResultToken || hasStoredReturningToken) {
      return null;
    }
    
    // Only show if user has assigned number and name, and not during initial loading
    if (!assignedNumber || !participantName || isResolving || !showRegistrationContent) {
      return null;
    }
    
    // Use relative positioning in round mode (step 4), fixed otherwise
    const positionClass = step === 4 
      ? "relative top-0 left-2 sm:left-3 md:left-4 z-[100]" 
      : "fixed top-2 left-2 sm:top-3 sm:left-3 md:top-4 md:left-4 z-[100]";
    
    return (
      <div className={positionClass}>
        <div className="group cursor-pointer transition-all duration-700 ease-out hover:scale-105">
          <div className="relative">
            {/* Glow effect background */}
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 rounded-lg sm:rounded-xl blur-sm sm:blur-md opacity-60 group-hover:opacity-80 transition-opacity duration-1000 ease-in-out"></div>
            
            {/* Main participant container */}
            <div className="relative bg-gradient-to-br from-slate-800/90 via-slate-700/90 to-slate-800/90 backdrop-blur-xl border border-white/10 rounded-lg sm:rounded-xl p-2 sm:p-3 shadow-lg sm:shadow-xl group-hover:shadow-cyan-500/20 transition-all duration-700 ease-out">
              <div className="flex flex-col items-center text-center min-w-[60px] sm:min-w-[70px]">
                {/* Participant Number */}
                <div className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent font-bold text-lg sm:text-xl leading-tight">
                  #{assignedNumber}
                </div>
                {/* Participant Name */}
                <div className="text-white/90 text-xs sm:text-sm font-medium leading-tight mt-1 max-w-[80px] sm:max-w-[90px] truncate">
                  {participantName}
                </div>
              </div>
            </div>
            
            {/* Subtle animated border */}
            <div className="absolute inset-0 rounded-lg sm:rounded-xl bg-gradient-to-r from-cyan-500/30 via-blue-500/30 to-purple-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 ease-in-out"></div>
          </div>
        </div>
      </div>
    );
  };

  // Brute force protection functions
  const checkTokenLockout = (type: 'token' | 'resultToken') => {
    const now = Date.now();
    const lockoutUntil = type === 'token' ? tokenLockoutUntil : resultTokenLockoutUntil;
    
    if (lockoutUntil && now < lockoutUntil) {
      const remainingTime = Math.ceil((lockoutUntil - now) / 1000);
      return remainingTime;
    }
    return 0;
  };

  const calculateLockoutDuration = (attempts: number) => {
    // Progressive lockout: 30s, 2min, 5min, 15min, 30min, 1hr
    const durations = [30, 120, 300, 900, 1800, 3600];
    const index = Math.min(attempts - 3, durations.length - 1);
    return durations[index] * 1000; // Convert to milliseconds
  };

  const handleTokenAttempt = (type: 'token' | 'resultToken', isValid: boolean = false) => {
    const now = Date.now();
    
    if (type === 'token') {
      const newAttempts = tokenAttempts + 1;
      setTokenAttempts(newAttempts);
      setLastTokenAttempt(now);
      
      if (!isValid && newAttempts >= 3) {
        const lockoutDuration = calculateLockoutDuration(newAttempts);
        setTokenLockoutUntil(now + lockoutDuration);
      }
    } else {
      const newAttempts = resultTokenAttempts + 1;
      setResultTokenAttempts(newAttempts);
      setLastResultTokenAttempt(now);
      
      if (!isValid && newAttempts >= 3) {
        const lockoutDuration = calculateLockoutDuration(newAttempts);
        setResultTokenLockoutUntil(now + lockoutDuration);
      }
    }
  };

  const resetAttemptsIfNeeded = () => {
    const now = Date.now();
    const resetTime = 5 * 60 * 1000; // 5 minutes
    
    // Reset token attempts if 5 minutes have passed since last attempt
    if (lastTokenAttempt && now - lastTokenAttempt > resetTime) {
      setTokenAttempts(0);
      setTokenLockoutUntil(null);
    }
    
    // Reset result token attempts if 5 minutes have passed since last attempt
    if (lastResultTokenAttempt && now - lastResultTokenAttempt > resetTime) {
      setResultTokenAttempts(0);
      setResultTokenLockoutUntil(null);
    }
  };

  const getSecurityStatus = (type: 'token' | 'resultToken') => {
    const attempts = type === 'token' ? tokenAttempts : resultTokenAttempts;
    const lockoutTime = checkTokenLockout(type);
    
    if (lockoutTime > 0) {
      return {
        isLocked: true,
        remainingTime: lockoutTime,
        message: `محظور لمدة ${lockoutTime} ثانية`,
        warningLevel: 'error'
      };
    }
    
    if (attempts >= 2) {
      return {
        isLocked: false,
        remainingTime: 0,
        message: `تحذير: محاولة واحدة متبقية قبل الحظر`,
        warningLevel: 'warning'
      };
    }
    
    if (attempts >= 1) {
      return {
        isLocked: false,
        remainingTime: 0,
        message: `${2 - attempts} محاولات متبقية`,
        warningLevel: 'info'
      };
    }
    
    return {
      isLocked: false,
      remainingTime: 0,
      message: '',
      warningLevel: 'none'
    };
  };

  const handleTokenNavigation = async (token: string) => {
    const lockoutTime = checkTokenLockout('token');
    if (lockoutTime > 0) {
      toast.error(`تم تجاوز عدد المحاولات المسموح. يرجى المحاولة مرة أخرى بعد ${lockoutTime} ثانية`);
      return;
    }
    
    if (!token.trim()) {
      handleTokenAttempt('token', false);
      toast.error("يرجى إدخال رمز صحيح");
      return;
    }
    
    // For now, we assume the token is valid if it's not empty
    // In a real implementation, you'd validate against the server first
    handleTokenAttempt('token', true);
    
    // Save token to localStorage before redirecting
    saveUserToken(token);
    console.log('💾 Saved returning player token before navigation:', token);
    
    // Immediately check for incomplete survey and show popup if needed instead of redirecting
    const hasIncomplete = await checkIncompleteSurvey(token);
    if (hasIncomplete) {
      // Popup will show; do not redirect so user can choose to redo survey
      return;
    }
    
    window.location.href = `/welcome?token=${token}`;
  };

  // Navigate to results page
  const viewResults = (token: string) => {
    const lockoutTime = checkTokenLockout('resultToken');
    if (lockoutTime > 0) {
      toast.error(`تم تجاوز عدد المحاولات المسموح. يرجى المحاولة مرة أخرى بعد ${lockoutTime} ثانية`);
      return;
    }
    
    if (!token.trim()) {
      handleTokenAttempt('resultToken', false);
      toast.error("يرجى إدخال رمز صحيح");
      return;
    }
    
    // For now, we assume the token is valid if it's not empty
    // In a real implementation, you'd validate against the server first
    handleTokenAttempt('resultToken', true);
    
    // Save token to localStorage before redirecting
    saveUserToken(token);
    console.log('💾 Saved result token before navigation:', token);
    
    // Navigate to results page with token as URL parameter
    window.location.href = `/results?token=${encodeURIComponent(token)}`;
  };

  const restart = () => {
    setStep(-1)
    setPersonalitySummary("")
    setIsRepeatMatch(false)
  }
  const previous = () => setStep((s) => Math.max(s - 1, -2))

  // Check participant data from database to determine which questions to show
  const checkParticipantData = async (phoneNumber: string) => {
    try {
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "phone-lookup-data",
          phone_number: phoneNumber
        }),
      })
      
      if (res.ok) {
        const data = await res.json()
        if (data.participant) {
          const participant = data.participant
          
          // Check if participant has filled humor style and openness comfort (direct columns)
          const hasHumorStyle = participant?.humor_banter_style !== null && participant?.humor_banter_style !== undefined
          const hasOpennessComfort = participant?.early_openness_comfort !== null && participant?.early_openness_comfort !== undefined
          
          setParticipantHasHumorStyle(!!hasHumorStyle)
          setParticipantHasOpennessComfort(!!hasOpennessComfort)
          
          console.log('📊 Participant data check:', {
            hasHumorStyle: !!hasHumorStyle,
            hasOpennessComfort: !!hasOpennessComfort
          })
        }
      } else {
        // If participant not found, show all questions
        setParticipantHasHumorStyle(false)
        setParticipantHasOpennessComfort(false)
      }
    } catch (err) {
      console.error("Error checking participant data:", err)
      // Default to showing all questions if check fails
      setParticipantHasHumorStyle(false)
      setParticipantHasOpennessComfort(false)
    }
  }

  // Check if participant has incomplete vibe questions (below 50% minimum)
  const checkVibeQuestionsCompletion = async (token: string) => {
    // Don't show vibe popup if other popups are already showing
    if (showSurveyCompletionPopup || showNewUserTypePopup || showNextEventPopup || showReturningSignupPopup || showSurveyRecoveryPopup) {
      return;
    }
    
    try {
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache"
        },
        body: JSON.stringify({ 
          action: "resolve-token",
          secure_token: token
        }),
      })
      
      if (res.ok) {
        const data = await res.json()
        
        // Check both data.survey_data AND data.participant.survey_data
        const surveyData = data.survey_data || data.participant?.survey_data
        
        // Only check vibe questions if user HAS survey data (completed survey)
        if (data.success && surveyData && Object.keys(surveyData).length > 1) {
          // Survey data structure: Can be direct (vibe_1) OR nested (answers.vibe_1)
          // Check if vibe_1 exists at top level or in answers
          const hasNestedVibe = surveyData.answers && 'vibe_1' in surveyData.answers
          const answers = hasNestedVibe ? surveyData.answers : surveyData
          
          // Define vibe questions with their limits
          const vibeQuestions = {
            vibe_1: { max: 150, label: "السؤال 29: وصف الويكند المثالي" },
            vibe_2: { max: 100, label: "السؤال 30: خمس هوايات" },
            vibe_3: { max: 100, label: "السؤال 31: الفنان المفضل" },
            vibe_5: { max: 150, label: "السؤال 33: كيف يوصفك أصدقائك" },
            vibe_6: { max: 150, label: "السؤال 34: كيف تصف أصدقائك" }
          }
          
          const incomplete: {[key: string]: {current: number, required: number, max: number, label: string}} = {}
          const currentAnswers: {[key: string]: string} = {}
          
          for (const [key, config] of Object.entries(vibeQuestions)) {
            const answer = answers[key] || ""
            const currentLength = answer.length
            const minRequired = Math.ceil(config.max * 0.5)
            
            // Always store current answers so users can edit them
            currentAnswers[key] = answer
            
            if (currentLength < minRequired) {
              incomplete[key] = {
                current: currentLength,
                required: minRequired,
                max: config.max,
                label: config.label
              }
            }
          }
          
          // If any questions are incomplete, show the completion popup
          if (Object.keys(incomplete).length > 0) {
            setIncompleteVibeQuestions(incomplete)
            setVibeAnswers(currentAnswers)
            setShowVibeCompletionPopup(true)
            console.log("💡 Vibe questions incomplete, showing popup", incomplete)
            return
          }
        }
      }
    } catch (err) {
      console.error("Error checking vibe questions:", err)
    }
  }

  // Handle vibe questions completion submission
  const handleVibeCompletionSubmit = async () => {
    // Validate that all incomplete questions now meet minimum requirement
    const stillIncomplete: string[] = []
    
    for (const [key, info] of Object.entries(incompleteVibeQuestions)) {
      const currentLength = (vibeAnswers[key] || "").length
      if (currentLength < info.required) {
        const remaining = info.required - currentLength
        stillIncomplete.push(`${info.label}: يحتاج ${remaining} حرف إضافي`)
      }
    }
    
    if (stillIncomplete.length > 0) {
      toast.error(`⚠️ يرجى إكمال الحد الأدنى المطلوب:\n${stillIncomplete.join('\n')}`)
      return
    }
    
    setVibeLoading(true)
    try {
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "update-vibe-questions",
          secure_token: secureToken,
          vibe_answers: vibeAnswers
        })
      });
      const data = await res.json()
      
      if (res.ok && data.success) {
        toast.success(data.message || "تم تحديث البيانات بنجاح!");
        setShowVibeCompletionPopup(false);
      } else {
        toast.error(data.error || "حدث خطأ أثناء التحديث");
      }
    } catch (err) {
      console.error("Error updating vibe questions:", err);
      toast.error("حدث خطأ أثناء التحديث");
    } finally {
      setVibeLoading(false)
    }
  }

  // Handle returning participant phone lookup - show popup first
  const handleReturningParticipant = async () => {
    if (!returningPhoneNumber.trim()) {
      toast.error("يرجى إدخال رقم الهاتف")
      return
    }
    
    // Check participant data before showing popup
    await checkParticipantData(returningPhoneNumber)
    setShowReturningSignupPopup(true)
  }

  // Handle actual signup submission from popup
  const handleReturningSignupSubmit = async () => {
    setReturningLoading(true)
    try {
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "phone-lookup-signup",
          phone_number: returningPhoneNumber,
          gender_preference: returningGenderPreference,
          humor_banter_style: returningHumorStyle,
          early_openness_comfort: returningOpennessComfort,
          auto_signup_next_event: autoSignupNextEvent
        }),
      })
      
      const data = await res.json()
      
      if (res.ok) {
        toast.success(`${data.message} - مرحباً ${data.participant_name} (#${data.participant_number})`)
        setReturningPhoneNumber("")
        setReturningHumorStyle("")
        setReturningOpennessComfort("")
        setShowReturningSignupPopup(false)
        // Refresh the gender preference badge
        if (data.secure_token) {
          pollParticipantData(data.secure_token);
        }
      } else {
        toast.error(`${data.error}${data.message ? ' - ' + data.message : ''}`)
      }
    } catch (err) {
      console.error("Error with returning participant:", err)
      toast.error("حدث خطأ في النظام")
    } finally {
      setReturningLoading(false)
    }
  }

  // Poll participant data when missing from localStorage
  const pollParticipantData = async (token: string) => {
    try {
      console.log('📡 Polling participant data with token...');
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve-token", secure_token: token }),
      })
      const data = await res.json()
      
      if (res.ok && data.success) {
        console.log('✅ Successfully polled participant data:', data.name, '#' + data.assigned_number);
        
        // Update state
        if (data.name && !participantName) {
          setParticipantName(data.name);
          localStorage.setItem('blindmatch_participant_name', data.name);
          console.log('💾 Saved participant name to localStorage:', data.name);
        }
        
        if (data.assigned_number && !assignedNumber) {
          setAssignedNumber(data.assigned_number);
          localStorage.setItem('blindmatch_participant_number', data.assigned_number.toString());
          console.log('💾 Saved participant number to localStorage:', data.assigned_number);
        }

        // Update gender preference badge from DB
        if (typeof data.gender_preference === 'string' && data.gender_preference.trim()) {
          setReturningGenderPreference(data.gender_preference)
          // preference source: DB only (no localStorage caching)
          console.log('🎯 Fetched gender preference from DB:', data.gender_preference)
        }
      } else {
        console.log('❌ Failed to poll participant data:', data.message);
      }
    } catch (err) {
      console.error("Error polling participant data:", err)
      // Silently fail - this is not critical functionality
    }
  }

  // Check if logged in user needs next event signup
  const checkNextEventSignup = async (token: string) => {
    // Don't show next event popup if other popups are already showing
    if (showSurveyCompletionPopup || showNewUserTypePopup || showSurveyRecoveryPopup) {
      console.log('❌ Other popup is showing, skipping next event signup popup');
      return;
    }
    
    try {
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "check-next-event-signup",
          secure_token: token
        }),
      })
      
      const data = await res.json()
      
      if (res.ok && data.participant) {
        const participant = data.participant
        
        // Check what questions the participant has already filled (direct columns)
        const hasHumorStyle = participant.humor_banter_style !== null && participant.humor_banter_style !== undefined
        const hasOpennessComfort = participant.early_openness_comfort !== null && participant.early_openness_comfort !== undefined
        
        setParticipantHasHumorStyle(!!hasHumorStyle)
        setParticipantHasOpennessComfort(!!hasOpennessComfort)
        
        console.log('📊 Next event participant data check:', {
          hasHumorStyle: !!hasHumorStyle,
          hasOpennessComfort: !!hasOpennessComfort
        })
        
        // Show popup if signup_for_next_event is false
        if (!participant.signup_for_next_event) {
          setParticipantInfo({
            name: participant.name,
            assigned_number: participant.assigned_number
          })
          setShowNextEventPopup(true)
        } else {
          // User is already signed up, update the button state
          console.log('✅ User already signed up for next event, updating button state')
          setShowNextEventSignup(true)
          
          // Check if auto-signup is enabled
          if (participant.auto_signup_next_event) {
            setAutoSignupEnabled(true)
            console.log('✨ Auto-signup for all future events is enabled')
          } else {
            setAutoSignupEnabled(false)
            console.log('💡 Auto-signup available - show offer in navbar')
          }
        }
      }
    } catch (err) {
      console.error("Error checking next event signup:", err)
      // Silently fail - this is not critical functionality
    }
  }

  // Check if user has incomplete survey data
  const checkIncompleteSurvey = async (savedToken: string): Promise<boolean> => {
    // Don't show popup if URL has ?token parameter or other popups are showing
    if (window.location.search.includes('?token') || showNewUserTypePopup || showSurveyRecoveryPopup) {
      console.log('❌ URL has ?token parameter or other popup showing, skipping survey completion popup');
      return false;
    }
    
    // Don't show popup if user just created their token (new user in middle of registration)
    if (isJustCreatedUser) {
      console.log('❌ User just created token, skipping survey completion popup');
      return false;
    }
    
    try {
      console.log('🔍 Checking survey completion status for saved token...');
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve-token", secure_token: savedToken }),
      })
      const data = await res.json()
      
      if (res.ok && data.success) {
        // Keep navbar badge in sync with DB
        if (typeof data.gender_preference === 'string' && data.gender_preference.trim()) {
          setReturningGenderPreference(data.gender_preference)
          // preference source: DB only (no localStorage caching)
        }
        // Simple rule: only check nationality column
        const noNationality = (data.nationality == null) || (typeof data.nationality === 'string' && data.nationality.trim().length === 0)
        if (noNationality) {
          console.log('📝 Incomplete survey detected — showing popup');
          setIncompleteSurveyInfo({
            name: data.name || "المشارك",
            assigned_number: data.assigned_number,
            secure_token: savedToken
          });
          setShowSurveyCompletionPopup(true);
          return true;
        } else {
          console.log('✅ Survey is complete');
          return false;
        }
      }
      return false;
    } catch (err) {
      console.error("Error checking survey completion:", err)
      // Silently fail - this is not critical functionality
      return false;
    }
  }

  // Handle auto signup for next event
  const handleAutoSignupNextEvent = async () => {
    const token = resultToken || returningPlayerToken
    if (!token) return

    setNextEventSignupLoading(true)
    try {
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "auto-signup-next-event",
          secure_token: token,
          gender_preference: returningGenderPreference,
          humor_banter_style: returningHumorStyle,
          early_openness_comfort: returningOpennessComfort,
          auto_signup_next_event: autoSignupNextEvent
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        toast.success(data.message || "تم تسجيلك للحدث القادم بنجاح!");
        setShowNextEventPopup(false);
        // Update UI immediately to reflect signup state without refresh
        setShowNextEventSignup(true);
        // Refresh the gender preference badge
        if (token) {
          pollParticipantData(token);
        }
      } else {
        toast.error(`${data.error}${data.message ? ' - ' + data.message : ''}`);
      }
    } catch (err) {
      console.error("Error with auto signup:", err)
      toast.error("حدث خطأ في النظام")
    } finally {
      setNextEventSignupLoading(false)
    }
  }

  // Handle returning user token input in new user popup
  const handleReturningUserToken = async () => {
    if (!newUserTokenInput.trim()) {
      toast.error("يرجى إدخال الرمز المميز");
      return;
    }

    setNewUserTokenLoading(true);
    try {
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "resolve-token", 
          secure_token: newUserTokenInput.trim() 
        }),
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        // Save token and participant data to localStorage
        localStorage.setItem('blindmatch_result_token', newUserTokenInput.trim());
        localStorage.setItem('blindmatch_returning_token', newUserTokenInput.trim());
        
        if (data.name) {
          localStorage.setItem('blindmatch_participant_name', data.name);
          setParticipantName(data.name);
        }
        
        if (data.assigned_number) {
          localStorage.setItem('blindmatch_participant_number', data.assigned_number.toString());
          setAssignedNumber(data.assigned_number);
        }
        // Sync gender preference from DB for navbar badge
        if (typeof data.gender_preference === 'string' && data.gender_preference.trim()) {
          setReturningGenderPreference(data.gender_preference);
          // preference source: DB only (no localStorage caching)
        }
        
        // Set token fields
        setResultToken(newUserTokenInput.trim());
        setReturningPlayerToken(newUserTokenInput.trim());
        
        // Close popup and show success
        setShowNewUserTypePopup(false);
        setNewUserTokenInput("");
        
        toast.success(`مرحباً بعودتك ${data.name || ''}! تم تحميل بياناتك بنجاح`);
        
        // Check for next event signup and incomplete survey
        setTimeout(() => {
          checkNextEventSignup(newUserTokenInput.trim());
        }, 1000);
        
        setTimeout(() => {
          checkIncompleteSurvey(newUserTokenInput.trim());
        }, 1500);

        setTimeout(() => {
          checkSurveyRecovery(newUserTokenInput.trim())
        }, 1200);
        
      } else {
        toast.error(`${data.error || 'رمز غير صحيح'} - يرجى التأكد من الرمز والمحاولة مرة أخرى`);
      }
    } catch (err) {
      console.error("Error resolving token:", err);
      toast.error("حدث خطأ في النظام");
    } finally {
      setNewUserTokenLoading(false);
    }
  };

  // Handle new user selection
  const handleNewUser = () => {
    setShowNewUserTypePopup(false);
    setNewUserTokenInput("");
    console.log('🆕 User selected new user, popup closed');
    
    // Scroll to the new user section
    setTimeout(() => {
      const newUserSection = document.querySelector('[data-section="new-user"]');
      if (newUserSection) {
        newUserSection.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
    }, 300); // Small delay to allow popup to close
  };

  // Handle new user direct action (same as main page button)
  const handleNewUserDirect = async () => {
    setShowNewUserTypePopup(false);
    setNewUserTokenInput("");
    console.log('🆕 User selected new user, creating token directly');
    
    setLoading(true);
    try {
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-token" }),
      });
      const data = await res.json();
      console.log("Token creation response:", data);
      
      if (res.status === 403) {
        // Registration is closed
        toast.error(data.message || "التسجيل مغلق حالياً");
        return;
      }
      
      if (res.ok && data.secure_token) {
        // Mark just-created to show modal after redirect
        sessionStorage.setItem('justCreatedToken', '1');
        sessionStorage.setItem('justCreatedTokenValue', data.secure_token);
        saveUserToken(data.secure_token); // Save token to localStorage for auto-fill
        
        // Navigate to survey with token
        window.location.href = `/welcome?token=${data.secure_token}`;
      } else {
        console.error("Failed to create token:", data);
        toast.error("فشل في إنشاء الرمز المميز. حاول مرة أخرى.");
      }
    } catch (error) {
      console.error("Error creating token:", error);
      toast.error("حدث خطأ. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  // Handle contact form submission
  const handleContactSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!contactForm.email || !contactForm.message || !contactForm.phone) {
      toast.error("يرجى ملء البريد الإلكتروني ورقم الهاتف والرسالة");
      return;
    }

    setContactFormLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('email', contactForm.email);
      formData.append('name', contactForm.name || 'غير محدد');
      formData.append('phone', contactForm.phone);
      formData.append('subject', contactForm.subject || 'رسالة من BlindMatch');
      formData.append('message', contactForm.message);
      formData.append('_replyto', contactForm.email);
      
      const response = await fetch('https://formspree.io/f/mqayygpv', {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        toast.success("تم إرسال رسالتك بنجاح! سنتواصل معك قريباً");
        setContactForm({ email: "", name: "", phone: "", message: "", subject: "" });
        setShowContactForm(false);
      } else {
        throw new Error('Form submission failed');
      }
    } catch (error) {
      console.error('Contact form error:', error);
      toast.error("حدث خطأ في إرسال الرسالة. يرجى المحاولة مرة أخرى");
    } finally {
      setContactFormLoading(false);
    }
  };

  // Handle contact form input changes
  const handleContactInputChange = (field: string, value: string) => {
    setContactForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Initialize contact form with participant data when form opens
  useEffect(() => {
    if (showContactForm && participantName && assignedNumber) {
      const participantDisplayName = `${participantName} | #${assignedNumber}`;
      setContactForm(prev => ({
        ...prev,
        name: participantDisplayName
      }));
    }
  }, [showContactForm, participantName, assignedNumber]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  // Periodically check and reset attempts if enough time has passed
  useEffect(() => {
    const interval = setInterval(() => {
      resetAttemptsIfNeeded();
    }, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, [lastTokenAttempt, lastResultTokenAttempt]);

  // Debug: Log step changes
  useEffect(() => {
    console.log(`🔄 Step changed to: ${step} (phase: ${phase})`);
  }, [step, phase])

  // Check if user just created token (to prevent showing incomplete survey popup)
  useEffect(() => {
    const justCreated = sessionStorage.getItem('justCreatedToken') === '1';
    if (justCreated) {
      console.log('🆕 Detected newly created user, setting isJustCreatedUser state');
      setIsJustCreatedUser(true);
      
      // Clear the flag after survey is completed (when step changes away from 1)
      // This will be handled in the step change effect
    }
  }, []); // Run once on mount

  // Local storage functionality for auto-filling tokens

  useEffect(() => {
    // Load saved tokens from localStorage on component mount
    // Since both fields use the same token, use whichever is available
    const savedResultToken = localStorage.getItem('blindmatch_result_token');
    const savedReturningToken = localStorage.getItem('blindmatch_returning_token');
    
    // Use the most recent token (either one works since they're the same)
    const tokenToUse = savedResultToken || savedReturningToken;
    
    if (tokenToUse) {
      // Auto-fill token fields with saved token (no validation)
      setResultToken(tokenToUse);
      setReturningPlayerToken(tokenToUse);
      console.log('💾 Auto-filled both token fields with saved token:', tokenToUse);
      
      // Check for next event signup on all steps EXCEPT survey (step 1)
      // Don't show popup when user is accessing a specific token URL
      if (!token && step !== 1) {
        console.log('✅ Checking next event signup status (step:', step, ')');
        setTimeout(() => {
          checkNextEventSignup(tokenToUse);
        }, 2000); // Give page time to load
        
        // Also check if user has incomplete survey data (only on main page)
        if (step === 0) {
          // Check for technical recovery first to avoid conflicting popups
          setTimeout(() => {
            checkSurveyRecovery(tokenToUse)
          }, 800)
          setTimeout(() => {
            checkIncompleteSurvey(tokenToUse);
          }, 1000); // Check survey completion status
          
          // Check if user has incomplete vibe questions (below 50% minimum)
          setTimeout(() => {
            checkVibeQuestionsCompletion(tokenToUse);
          }, 2500); // Check after survey check and next event signup
        }
      } else {
        console.log('❌ Token in URL or on survey step, skipping next event check');
      }
      setTokenValidationCompleted(true);
    } else {
      console.log('ℹ️ No saved tokens found in localStorage');
      
      // Show new user type popup for users without saved credentials
      // Show new user type popup for users without tokens (but not if URL has token parameter)
      if (!token && step === 0 && !window.location.search.includes('token=')) {
        console.log('🆕 New user detected, showing user type popup...');
        setTimeout(() => {
          setShowNewUserTypePopup(true);
        }, 1000); // Small delay to let page load
      } else {
        console.log('❌ Skipping new user type popup since URL has token parameter or user is not on main page');
      }
      
      setTokenValidationCompleted(true);
    }
  }, []); // Run once on mount

  // Load saved participant data on page load
  useEffect(() => {
    const savedName = localStorage.getItem('blindmatch_participant_name');
    const savedNumber = localStorage.getItem('blindmatch_participant_number');
    const savedToken = localStorage.getItem('blindmatch_result_token') || localStorage.getItem('blindmatch_returning_token');
    
    if (savedName) {
      setParticipantName(savedName);
      console.log('📋 Loaded saved participant name:', savedName);
    }
    
    if (savedNumber) {
      const numberValue = parseInt(savedNumber, 10);
      if (!isNaN(numberValue)) {
        setAssignedNumber(numberValue);
        console.log('📋 Loaded saved participant number:', numberValue);
      }
    }
    
    if (savedToken) {
      setSecureToken(savedToken);
      console.log('📋 Loaded saved secure token:', savedToken);
    }
    
    
    // If we have a token, poll to refresh preference badge (and other info)
    if (savedToken) {
      console.log('🔍 Polling API with saved token to refresh preference badge...');
      pollParticipantData(savedToken);
    }
  }, []);

  // Save tokens to localStorage when they change and sync both fields
  useEffect(() => {
    if (resultToken.trim()) {
      localStorage.setItem('blindmatch_result_token', resultToken);
      localStorage.setItem('blindmatch_returning_token', resultToken);
      // Sync the other field if it's different
      if (returningPlayerToken !== resultToken) {
        setReturningPlayerToken(resultToken);
      }
    }
  }, [resultToken]);

  useEffect(() => {
    if (returningPlayerToken.trim()) {
      localStorage.setItem('blindmatch_returning_token', returningPlayerToken);
      localStorage.setItem('blindmatch_result_token', returningPlayerToken);
      // Sync the other field if it's different
      if (resultToken !== returningPlayerToken) {
        setResultToken(returningPlayerToken);
      }
    }
  }, [returningPlayerToken]);

  // Save token whenever user has a secure token available (any step/round)
  useEffect(() => {
    if (secureToken && secureToken.trim()) {
      console.log('💾 Auto-saving secure token from any step/round:', secureToken);
      saveUserToken(secureToken);
      // Refresh preference badge from DB whenever secureToken is set/changed
      pollParticipantData(secureToken);
    }
  }, [secureToken]);

  // Save token immediately when URL contains token parameter (before resolution)
  useEffect(() => {
    if (token && token.trim()) {
      console.log('💾 Auto-saving token from URL parameter:', token);
      saveUserToken(token);
    }
  }, [token]);

  // Save token when user successfully completes survey or joins
  const saveUserToken = (token: string, name?: string, number?: number) => {
    if (token && token.trim()) {
      localStorage.setItem('blindmatch_result_token', token);
      localStorage.setItem('blindmatch_returning_token', token);
      if (name) {
        localStorage.setItem('blindmatch_participant_name', name);
      }
      if (number) {
        localStorage.setItem('blindmatch_participant_number', number.toString());
      }
      setResultToken(token);
      setReturningPlayerToken(token);
      console.log('💾 Token saved to localStorage:', token, name ? `(${name})` : '', number ? `#${number}` : '');
    }
  };

  // Clear saved tokens
  const clearSavedTokens = () => {
    localStorage.removeItem('blindmatch_result_token');
    localStorage.removeItem('blindmatch_returning_token');
    localStorage.removeItem('blindmatch_participant_name');
    localStorage.removeItem('blindmatch_participant_number');
    // Also clear sessionStorage items related to tokens
    sessionStorage.removeItem('justCreatedToken');
    sessionStorage.removeItem('justCreatedTokenValue');
    setResultToken('');
    setReturningPlayerToken('');
    setParticipantName(null);
    setAssignedNumber(null);
    setSecureToken(null); // Clear secure token state
    console.log('🗑️ Cleared all saved tokens from localStorage and sessionStorage');
  };

  // Clear specific token (for individual X buttons)
  const clearSpecificToken = (tokenType: 'result' | 'returning') => {
    if (tokenType === 'result') {
      localStorage.removeItem('blindmatch_result_token');
      localStorage.removeItem('blindmatch_returning_token'); // Clear both since they're synced
      localStorage.removeItem('blindmatch_participant_name');
      localStorage.removeItem('blindmatch_participant_number');
      sessionStorage.removeItem('justCreatedToken');
      sessionStorage.removeItem('justCreatedTokenValue');
      setResultToken('');
      setReturningPlayerToken('');
      setParticipantName(null);
      setAssignedNumber(null);
      setSecureToken(null); // Clear secure token state
      console.log('🗑️ Cleared result token from localStorage and sessionStorage');
    } else if (tokenType === 'returning') {
      localStorage.removeItem('blindmatch_returning_token');
      localStorage.removeItem('blindmatch_result_token'); // Clear both since they're synced
      localStorage.removeItem('blindmatch_participant_name');
      localStorage.removeItem('blindmatch_participant_number');
      sessionStorage.removeItem('justCreatedToken');
      sessionStorage.removeItem('justCreatedTokenValue');
      setResultToken('');
      setReturningPlayerToken('');
      setParticipantName(null);
      setAssignedNumber(null);
      setSecureToken(null); // Clear secure token state
      console.log('🗑️ Cleared returning token from localStorage and sessionStorage');
    }
  };

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
      const res1 = await fetch("/api/participant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-participant",
          assigned_number: assignedNumber,
          secure_token: secureToken,
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
      const saveRes = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-participant",
          assigned_number: assignedNumber,
          secure_token: secureToken,
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
      // Prevent polling from forcing step changes for a few seconds after submit
      setSuppressPollingUntil(Date.now() + 6000)
      setShowFormFilledPrompt(false)
      
      // Treat brand-new users explicitly even if isEditingSurvey was set during the session
      if (isJustCreatedUser) {
        setFormFilledChoiceMade(true)
        setShowSurveySuccessModal(true)
        console.log("🎉 Brand-new user completed survey - showing success modal and skipping form prompt")
      } else if (!isEditingSurvey) {
        setFormFilledChoiceMade(true) // Mark choice as made for new users - they should go directly to analysis
        console.log("✅ New user completed survey - marked choice as made, going directly to analysis")
      } else {
        console.log("🔄 Editing session - keeping formFilledChoiceMade to prevent popup loop")
        setJustCompletedEditing(true) // Mark that user just completed editing
        // Clear the flag after a short delay to allow for step transitions
        setTimeout(() => setJustCompletedEditing(false), 2000)
      }
      
      setIsEditingSurvey(false)
      setAnalysisStarted(true)
      setStep(3)
      
      // Save token to localStorage since user completed survey successfully
      if (secureToken) {
        saveUserToken(secureToken);
      }
      
      // Clear the "just created" flag since user has now completed their survey
      if (isJustCreatedUser) {
        console.log('✅ Survey completed, clearing isJustCreatedUser flag');
        setIsJustCreatedUser(false);
        sessionStorage.removeItem('justCreatedToken');
        sessionStorage.removeItem('justCreatedTokenValue');
      }
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
    with: number | string
    type: string
    reason: string
    round: number
    table_number: number | null
    score: number
    is_repeat_match?: boolean
    mutual_match?: boolean
    humor_early_openness_bonus?: 'full' | 'partial' | 'none'
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
    console.log(`Fetching matches for round ${round}, event_id: ${currentEventId}`)
    
    try {
      const res = await fetch("/api/get-my-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          assigned_number: assignedNumber,
          event_id: currentEventId || 1
        })
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
        setHumorBonus(currentRoundMatch.humor_early_openness_bonus || 'none')
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
      } else {
        // No match found for this round → clear stale data from a previous round
        // (e.g., when transitioning round_1 → round_2 but R2 not generated yet, or
        //  when participant has R1 match but no R2 match assigned).
        console.log(`ℹ️ No match found for round ${round} — clearing previous round state`)
        setMatchResult(null)
        setMatchReason("")
        setCompatibilityScore(null)
        setHumorBonus('none')
        setTableNumber(null)
        setIsRepeatMatch(false)
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
    
    console.log("🔍 Fetching group matches for participant:", assignedNumber, "event_id:", currentEventId)
    try {
      const myMatches = await fetch("/api/get-my-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          assigned_number: assignedNumber, 
          match_type: "محايد", 
          round: 0,
          event_id: currentEventId || 1
        }),
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

  // Typewriter effect for AI analysis
  useEffect(() => {
    if (aiAnalysis && showAiAnalysis) {
      setDisplayedAnalysis("")
      setIsAnalysisTyping(true)
      
      let currentIndex = 0
      const intervalId = setInterval(() => {
        if (currentIndex < aiAnalysis.length) {
          setDisplayedAnalysis(aiAnalysis.substring(0, currentIndex + 1))
          currentIndex++
        } else {
          setIsAnalysisTyping(false)
          clearInterval(intervalId)
        }
      }, 20) // 20ms per character for smooth typing
      
      return () => clearInterval(intervalId)
    } else if (!showAiAnalysis) {
      // Reset when closing
      setDisplayedAnalysis("")
      setIsAnalysisTyping(false)
    }
  }, [aiAnalysis, showAiAnalysis])

  // Generate AI Vibe Analysis
  const generateVibeAnalysis = async () => {
    if (!secureToken || !matchResult || matchResult === 'المنظم' || isGeneratingAnalysis) {
      return
    }

    setIsGeneratingAnalysis(true)
    
    try {
      const response = await fetch('/api/participant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'generate-vibe-analysis',
          secure_token: secureToken,
          partner_number: matchResult,
          current_round: currentRound,
          event_id: currentEventId || 1
        }),
      })

      const data = await response.json()
      
      if (data.success) {
        setAiAnalysis(data.analysis)
        setShowAiAnalysis(true)
        
        if (data.cached) {
          console.log('🔄 Loaded existing AI analysis from match_results (shared between both participants)')
        } else {
          console.log('✨ Generated new AI analysis and stored in match_results')
        }
      } else {
        console.error('Failed to generate AI analysis:', data.error)
        toast.error('حدث خطأ أثناء توليد التحليل الذكي. يرجى المحاولة مرة أخرى.')
      }
    } catch (error) {
      console.error('Error generating AI analysis:', error)
      toast.error('حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مرة أخرى.')
    } finally {
      setIsGeneratingAnalysis(false)
    }
  }

  const submitFeedback = async () => {
    // Only validate the match preference question for round 1 - allow default values for rating questions
    if ((currentRound === 1 || currentRound === 2) && matchResult && matchResult !== 'المنظم' && wantMatch === null) {
      toast.error('يرجى الإجابة على سؤال: هل ترغب في التواصل مع هذا الشخص مرة أخرى؟');
      return;
    }

    // Save feedback to database
    if (assignedNumber && currentRound) {
      try {
        const response = await fetch("/api/participant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save-participant",
            assigned_number: assignedNumber,
            secure_token: secureToken,
            round: currentRound,
            event_id: currentEventId || 1,
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

    // Handle next event signup if checkbox was checked
    if (feedbackNextEventSignup && secureToken) {
      try {
        const signupResponse = await fetch("/api/participant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "auto-signup-next-event",
            secure_token: secureToken,
            auto_signup_next_event: true
          }),
        })

        const signupData = await signupResponse.json()
        if (signupResponse.ok) {
          console.log("✅ Auto-signup for next event enabled successfully")
          setShowNextEventSignup(true)
          setAutoSignupEnabled(true)
        } else {
          console.error("Failed to enable auto-signup:", signupData.error)
        }
      } catch (error) {
        console.error("Error enabling auto-signup:", error)
      }
    }

    // After submitting feedback, prepare to scroll to compatibility analysis in the results view
    shouldScrollToAnalysisRef.current = true
    setIsScoreRevealed(true)
    setModalStep("result")

    // If participant opted to match (round 1), submit preference and fetch partner info if mutual
    try {
      if (typeof wantMatch === 'boolean' && assignedNumber && typeof matchResult !== 'undefined' && matchResult !== null && matchResult !== 'المنظم') {
        const partnerNumber = parseInt(String(matchResult).replace(/[^0-9]/g, ''))
        if (!isNaN(partnerNumber)) {
          const prefRes = await fetch('/api/participant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'match-preference',
              assigned_number: assignedNumber,
              partner_number: partnerNumber,
              wants_match: wantMatch,
              round: currentRound,
              event_id: currentEventId || 1,
            })
          })
          const prefData = await prefRes.json()
          if (prefRes.ok) {
            // Update partner info if mutual
            if (prefData.mutual_match && prefData.partner_info) {
              setPartnerInfo(prefData.partner_info)
            }
            // Update history entry for this round
            setHistoryMatches(prev => prev.map(m => (
              m.round === currentRound && (m.with === partnerNumber || String(m.with) === String(partnerNumber))
                ? { ...m, mutual_match: !!prefData.mutual_match }
                : m
            )))
          } else {
            console.error('Failed to save match preference:', prefData.error)
          }
        }
      }
    } catch (e) {
      console.error('Error submitting match preference:', e)
    }
    
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
  // Enhanced to also expose structured metrics for the new model view
  const formatCompatibilityReason = (reason: string): { components: Array<{ name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }>; originalReason: string; metrics: { newModel: boolean; synergyScore: number; synergyMax: number; synergyPercent: number; vibe: number; lifestyle: number; humorOpen: number; communication: number; intentValues: number } } => {
    try {
      if (!reason || typeof reason !== 'string') return { components: [], originalReason: "معلومات التوافق غير متوفرة", metrics: { newModel: false, synergyScore: 0, synergyMax: 35, synergyPercent: 0, vibe: 0, lifestyle: 0, humorOpen: 0, communication: 0, intentValues: 0 } }
      
      // Extract scores (OLD model keys)
      const mbtiMatch = reason.match(/MBTI:.*?\((\d+)%\)/)
      const attachmentMatch = reason.match(/التعلق:.*?\((\d+)%\)/)
      const communicationOldMatch = reason.match(/التواصل:.*?\((\d+)%\)/)
      const lifestyleOldMatch = reason.match(/نمط الحياة:.*?\((\d+)%\)/)
      const coreValuesMatch = reason.match(/القيم الأساسية:.*?\((\d+)%\)/)
      const vibeOldMatch = reason.match(/التوافق الشخصي:.*?\((\d+)%\)/)
      
      const mbtiScore = mbtiMatch ? parseInt(mbtiMatch[1]) || 0 : 0
      const attachmentScore = attachmentMatch ? parseInt(attachmentMatch[1]) || 0 : 0
      const communicationOldScore = communicationOldMatch ? parseInt(communicationOldMatch[1]) || 0 : 0
      const lifestyleOldScore = lifestyleOldMatch ? parseInt(lifestyleOldMatch[1]) || 0 : 0
      const coreValuesScore = coreValuesMatch ? parseInt(coreValuesMatch[1]) || 0 : 0
      const vibeOldScore = vibeOldMatch ? parseInt(vibeOldMatch[1]) || 0 : 0

      // Extract scores (NEW 100-pt model keys, support EN and AR labels)
      const synergyMatch = reason.match(/(?:Synergy|التفاعل):\s*(\d+)%/)
      const vibeNewMatch = reason.match(/(?:Vibe|الطاقة):\s*(\d+)%/)
      const lifestyleNewMatch = reason.match(/(?:Lifestyle|نمط الحياة):\s*(\d+)%/)
      const humorOpenMatch = reason.match(/(?:Humor\/Openness|الدعابة\/الانفتاح):\s*(\d+)%/)
      const communicationNewMatch = reason.match(/(?:Communication|التواصل):\s*(\d+)%/)
      const intentValuesMatch = reason.match(/(?:Intent|Goal&Values|الأهداف\/القيم):\s*(\d+)%/)

      const synergyScore = synergyMatch ? parseInt(synergyMatch[1]) || 0 : 0 // max 35
      const vibeNewScore = vibeNewMatch ? parseInt(vibeNewMatch[1]) || 0 : 0   // max 20
      const lifestyleNewScore = lifestyleNewMatch ? parseInt(lifestyleNewMatch[1]) || 0 : 0 // max 15
      const humorOpenScore = humorOpenMatch ? parseInt(humorOpenMatch[1]) || 0 : 0 // max 15
      const communicationNewScore = communicationNewMatch ? parseInt(communicationNewMatch[1]) || 0 : 0 // max 10
      const intentValuesScore = intentValuesMatch ? parseInt(intentValuesMatch[1]) || 0 : 0 // max 5

      const hasNewModel = [synergyScore, vibeNewScore, lifestyleNewScore, humorOpenScore, communicationNewScore, intentValuesScore].some(s => s > 0)
    
    // Helper function to get strength level and color
    const getStrengthLevel = (score: number, maxScore: number) => {
      const percentage = (score / maxScore) * 100
      if (percentage >= 80) return { level: "ممتاز", color: "text-emerald-400", bgColor: "bg-emerald-500/20", borderColor: "border-emerald-400/30" }
      if (percentage >= 60) return { level: "جيد", color: "text-blue-400", bgColor: "bg-blue-500/20", borderColor: "border-blue-400/30" }
      if (percentage >= 40) return { level: "متوسط", color: "text-yellow-400", bgColor: "bg-yellow-500/20", borderColor: "border-yellow-400/30" }
      if (percentage >= 20) return { level: "ضعيف", color: "text-orange-400", bgColor: "bg-orange-500/20", borderColor: "border-orange-400/30" }
      return { level: "منخفض", color: "text-red-400", bgColor: "bg-red-500/20", borderColor: "border-red-400/30" }
    }
    
    // Prepare components based on detected model
    const components = [] as Array<{ name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }>
    
    if (hasNewModel) {
      // New model strengths (maxes per trigger-match.mjs)
      const synergyStrength = getStrengthLevel(synergyScore, 35)
      const vibeStrengthNew = getStrengthLevel(vibeNewScore, 20)
      const lifestyleStrengthNew = getStrengthLevel(lifestyleNewScore, 15)
      const humorOpenStrength = getStrengthLevel(humorOpenScore, 15)
      const communicationStrengthNew = getStrengthLevel(communicationNewScore, 10)
      const intentStrength = getStrengthLevel(intentValuesScore, 5)

      // Always show all six components (even if score is 0)
      components.push({
        name: "الانسجام التفاعلي",
        strength: synergyStrength.level,
        color: synergyStrength.color,
        bgColor: synergyStrength.bgColor,
        borderColor: synergyStrength.borderColor,
        description: synergyScore >= 28 ? "انسجام عالٍ في الأدوار وعمق الحديث والراحة مع الصمت." :
                     synergyScore >= 18 ? "انسجام جيد مع بعض الفروقات التي تحتاج تنسيق بسيط." :
                     "اختلافات ملحوظة في أسلوب التفاعل تحتاج وقت للتأقلم."
      })

      components.push({
        name: "الطاقة والكيمياء",
        strength: vibeStrengthNew.level,
        color: vibeStrengthNew.color,
        bgColor: vibeStrengthNew.bgColor,
        borderColor: vibeStrengthNew.borderColor,
        description: vibeNewScore >= 14 ? "كيمياء واضحة وتوافق في الإحساس العام والحماس." :
                     vibeNewScore >= 8 ? "انسجام لطيف في الطاقة مع مساحة للنمو." :
                     "إيقاعات مختلفة قد تحتاجان لبعض الوقت للتقارب."
      })

      components.push({
        name: "نمط الحياة",
        strength: lifestyleStrengthNew.level,
        color: lifestyleStrengthNew.color,
        bgColor: lifestyleStrengthNew.bgColor,
        borderColor: lifestyleStrengthNew.borderColor,
        description: lifestyleNewScore >= 12 ? "روتين متقارب جداً في التوقيت والتخطيط والأنشطة." :
                     lifestyleNewScore >= 8 ? "تشابه جيد في الروتين مع اختلافات بسيطة." :
                     "إيقاعات يومية مختلفة قد تتطلب تنسيقاً."
      })

      components.push({
        name: "الدعابة والانفتاح",
        strength: humorOpenStrength.level,
        color: humorOpenStrength.color,
        bgColor: humorOpenStrength.bgColor,
        borderColor: humorOpenStrength.borderColor,
        description: humorOpenScore >= 12 ? "حس فكاهي متقارب وارتياح جميل للانفتاح المبكر." :
                     humorOpenScore >= 8 ? "انسجام جيد في الدعابة ومستوى الانفتاح." :
                     "أساليب مزاح أو انفتاح مختلفة تحتاج حساسية متبادلة."
      })

      components.push({
        name: "أسلوب التواصل",
        strength: communicationStrengthNew.level,
        color: communicationStrengthNew.color,
        bgColor: communicationStrengthNew.bgColor,
        borderColor: communicationStrengthNew.borderColor,
        description: communicationNewScore >= 8 ? "تفاهم سريع ولغة مشتركة واضحة." :
                     communicationNewScore >= 5 ? "تواصل سهل إجمالاً مع حاجة أحياناً للتوضيح." :
                     "أساليب تواصل مختلفة قد تتطلب مرونة أكبر."
      })

      components.push({
        name: "الأهداف والقيم",
        strength: intentStrength.level,
        color: intentStrength.color,
        bgColor: intentStrength.bgColor,
        borderColor: intentStrength.borderColor,
        description: intentValuesScore >= 4 ? "اتجاهات متشابهة في هدف اللقاء وما يعتبر مهماً." :
                     intentValuesScore >= 2 ? "تقارب معقول في الأهداف أو القيم العامة." :
                     "توقعات مختلفة قد تحتاج وضوحاً مبكراً."
      })

      return { components, originalReason: reason, metrics: { newModel: true, synergyScore, synergyMax: 35, synergyPercent: Math.max(0, Math.min(100, Math.round((synergyScore / 35) * 100))), vibe: vibeNewScore, lifestyle: lifestyleNewScore, humorOpen: humorOpenScore, communication: communicationNewScore, intentValues: intentValuesScore } }
    }
    
    // Fallback to OLD model rendering
    const communicationScore = communicationOldScore
    const lifestyleScore = lifestyleOldScore
    const vibeScore = vibeOldScore
    const mbtiStrength = getStrengthLevel(mbtiScore, 5)
    const attachmentStrength = getStrengthLevel(attachmentScore, 5)
    const communicationStrength = getStrengthLevel(communicationScore, 25)
    const lifestyleStrength = getStrengthLevel(lifestyleScore, 20)
    const coreValuesStrength = getStrengthLevel(coreValuesScore, 10)
    const vibeStrength = getStrengthLevel(vibeScore, 35)

    // Create natural language description (OLD)
    
    if (mbtiScore > 0) {
      components.push({
        name: "التوافق النفسي",
        strength: mbtiStrength.level,
        color: mbtiStrength.color,
        bgColor: mbtiStrength.bgColor,
        borderColor: mbtiStrength.borderColor,
        description: mbtiScore >= 7 ? "عقلان يفكران بنفس الطريقة - تتفقان في طريقة اتخاذ القرارات وتنظيم الحياة" : 
                    mbtiScore >= 5 ? "شخصيتان متكاملتان - بعض الاختلافات التي تجعل المحادثات أكثر إثارة" : 
                    "أضداد تتجاذب - شخصيتان مختلفتان تماماً قد تتعلمان الكثير من بعضهما"
      })
    }
    
    if (attachmentScore > 0) {
      components.push({
        name: "أسلوب التعلق",
        strength: attachmentStrength.level,
        color: attachmentStrength.color,
        bgColor: attachmentStrength.bgColor,
        borderColor: attachmentStrength.borderColor,
        description: attachmentScore >= 12 ? "نفس احتياجات القرب والأمان - ستشعران بالراحة والثقة بسرعة" : 
                    attachmentScore >= 8 ? "احتياجات عاطفية متقاربة - قليل من الصبر وستجدان التوازن المثالي" : 
                    "احتياجات مختلفة للمساحة الشخصية - أحدكما يحب القرب والآخر يقدر الاستقلالية"
      })
    }
    
    if (communicationScore > 0) {
      components.push({
        name: "أسلوب التواصل",
        strength: communicationStrength.level,
        color: communicationStrength.color,
        bgColor: communicationStrength.bgColor,
        borderColor: communicationStrength.borderColor,
        description: communicationScore >= 20 ? "تتكلمان نفس اللغة - تفهمان بعضكما من نظرة واحدة" : 
                    communicationScore >= 15 ? "تواصل سهل وطبيعي - أحياناً تحتاجان لتوضيح أكثر لكن التفاهم موجود" : 
                    "أساليب تواصل مختلفة - أحدكما مباشر والآخر يفضل الإشارات الخفية"
      })
    }
    
    if (lifestyleScore > 0) {
      components.push({
        name: "نمط الحياة",
        strength: lifestyleStrength.level,
        color: lifestyleStrength.color,
        bgColor: lifestyleStrength.bgColor,
        borderColor: lifestyleStrength.borderColor,
        description: lifestyleScore >= 12 ? "تعيشان نفس الإيقاع - نوم مبكر أم سهر؟ رياضة أم قراءة؟ أنتما متفقان" : 
                    lifestyleScore >= 8 ? "روتين متشابه مع لمسات مختلفة - ستجدان أنشطة مشتركة تستمتعان بها" : 
                    "عوالم مختلفة تماماً - أحدكما صباحي والآخر ليلي، لكن هذا قد يكون مثيراً"
      })
    }
    
    if (coreValuesScore > 0) {
      components.push({
        name: "القيم الأساسية",
        strength: coreValuesStrength.level,
        color: coreValuesStrength.color,
        bgColor: coreValuesStrength.bgColor,
        borderColor: coreValuesStrength.borderColor,
        description: coreValuesScore >= 16 ? "نفس المبادئ والأحلام - تتفقان على ما هو مهم في الحياة" : 
                    coreValuesScore >= 12 ? "قيم متقاربة مع اختلافات بسيطة - ستثري نقاشاتكما بوجهات نظر جديدة" : 
                    "أولويات مختلفة في الحياة - ما يهمك قد لا يهمه والعكس صحيح"
      })
    }
    
    if (vibeScore > 0) {
      components.push({
        name: "التوافق الشخصي",
        strength: vibeStrength.level,
        color: vibeStrength.color,
        bgColor: vibeStrength.bgColor,
        borderColor: vibeStrength.borderColor,
        description: vibeScore >= 12 ? "كيمياء قوية - طاقة متشابهة وحس دعابة متقارب، ستستمتعان بصحبة بعضكما" : 
                    vibeScore >= 8 ? "انسجام جيد - شخصيتان لطيفتان ستجدان أرضية مشتركة للمرح" : 
                    "طاقات مختلفة - أحدكما هادئ والآخر نشيط، قد تحتاجان وقت للتعود على بعضكما"
      })
    }
    
    return { components, originalReason: reason, metrics: { newModel: false, synergyScore: 0, synergyMax: 35, synergyPercent: 0, vibe: vibeScore || 0, lifestyle: lifestyleScore || 0, humorOpen: 0, communication: communicationScore || 0, intentValues: coreValuesScore || 0 } }
    } catch (error) {
      console.error("Error in formatCompatibilityReason:", error)
      return { components: [], originalReason: "معلومات التوافق غير متوفرة", metrics: { newModel: false, synergyScore: 0, synergyMax: 35, synergyPercent: 0, vibe: 0, lifestyle: 0, humorOpen: 0, communication: 0, intentValues: 0 } }
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
          match_type: round === 0 ? "محايد" : "individual"
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
          match_type: round === 0 ? "محايد" : "individual"
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
          match_type: round === 0 ? "محايد" : "individual"
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
    if (!assignedNumber || currentRound === null || currentRound === undefined || !conversationStarted || globalTimerActive) return;
    
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
    if (assignedNumber && currentRound !== null && currentRound !== undefined && !globalTimerActive && !timerRestored) {
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

  // Animated gradient border fallback (time-based, only if CSS animation isn't active)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Quick probe: if --ab-angle changes over 600ms on the first card, CSS is working
    const probeEl = document.querySelector<HTMLElement>('.ai-animated-border');
    if (!probeEl) return;
    const startAngle = getComputedStyle(probeEl).getPropertyValue('--ab-angle').trim();

    let rafId = 0 as number;
    let cancel = false;

    const start = performance.now();
    const check = () => {
      const now = performance.now();
      if (now - start < 700) { // wait ~0.7s
        rafId = requestAnimationFrame(check);
        return;
      }
      const currentAngle = getComputedStyle(probeEl).getPropertyValue('--ab-angle').trim();
      const cssAnimating = startAngle !== currentAngle && currentAngle !== '';
      if (cssAnimating) return; // native CSS animation active → no JS fallback

      // JS fallback: compute angle from elapsed time for perfectly smooth loop
      const parseMs = (v: string) => {
        v = v.trim();
        if (v.endsWith('ms')) return parseFloat(v);
        if (v.endsWith('s')) return parseFloat(v) * 1000;
        const n = parseFloat(v);
        return isNaN(n) ? 12000 : n; // default 12s
      };

      const loop = (t0: number) => {
        if (cancel) return;
        const elements = document.querySelectorAll<HTMLElement>('.ai-animated-border');
        const nowTs = performance.now();
        elements.forEach(el => {
          const speedStr = getComputedStyle(el).getPropertyValue('--ab-speed') || '12s';
          const period = Math.max(1000, parseMs(speedStr));
          const phase = ((nowTs - t0) % period) / period; // 0..1
          const angle = phase * 360; // 0..360 (wraps smoothly)
          el.style.setProperty('--ab-angle', `${angle}deg`);
        });
        rafId = requestAnimationFrame(() => loop(t0));
      };

      rafId = requestAnimationFrame(() => loop(performance.now()));
    };

    rafId = requestAnimationFrame(check);
    return () => { cancel = true; if (rafId) cancelAnimationFrame(rafId); };
  }, [])

  // Pointer parallax highlight for cards (moves radial highlight to cursor)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mx = 50, my = 50;
    let raf = 0 as number;
    let dirty = false;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY; dirty = true;
      if (!raf) raf = requestAnimationFrame(update);
    };

    const update = () => {
      const cards = document.querySelectorAll<HTMLElement>('.ai-animated-border');
      cards.forEach(el => {
        const r = el.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((mx - r.left) / r.width) * 100));
        const y = Math.max(0, Math.min(100, ((my - r.top) / r.height) * 100));
        el.style.setProperty('--mx', `${x}%`);
        el.style.setProperty('--my', `${y}%`);
      });
      raf = 0 as number;
      if (dirty) { dirty = false; raf = requestAnimationFrame(update); }
    };

  }, [])

  // New User Type Popup will be rendered within main page structure

  // Contact Form Popup will be rendered within main page structure

  // Vibe Questions Completion Popup - Top Level (highest priority for displaying)
  if (vibeCompletionPopupEnabled && showVibeCompletionPopup && Object.keys(incompleteVibeQuestions).length > 0) {
    return (
      <div className="min-h-screen relative overflow-hidden page-bg" dir="rtl">
        {/* Background Animation */}
        <div className="absolute inset-0">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className={`absolute rounded-full blur-xl opacity-20 animate-pulse ${
                i % 2 === 0 ? 'bg-cyan-400' : 'bg-blue-500'
              }`}
              style={{
                width: `${32 + (i % 3) * 24}px`,
                height: `${32 + (i % 3) * 24}px`,
                left: `${10 + i * 12}%`,
                top: `${15 + (i % 4) * 20}%`,
                animationDelay: `${i * 0.8}s`,
                animationDuration: `${4 + (i % 3)}s`,
              }}
            />
          ))}
        </div>

        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`max-w-2xl w-full max-h-[90vh] rounded-2xl shadow-2xl border-2 ${dark ? "bg-slate-800/95 border-slate-600" : "bg-white/95 border-gray-200"} flex flex-col`} dir="rtl">
            <div className="p-6 overflow-y-auto">
              <div className="space-y-4">
                {/* Icon */}
                <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${dark ? "bg-yellow-500/20" : "bg-yellow-100"}`}>
                  <AlertTriangle className={`w-8 h-8 ${dark ? "text-yellow-400" : "text-yellow-600"}`} />
                </div>
                
                <h3 className={`text-xl font-bold text-center ${dark ? "text-slate-100" : "text-gray-800"}`}>
                  إكمال الأسئلة المطلوبة
                </h3>
                
                <div className={`p-4 rounded-xl border ${dark ? "bg-yellow-500/10 border-yellow-400/30" : "bg-yellow-50 border-yellow-200"}`}>
                  <p className={`text-sm font-medium ${dark ? "text-yellow-300" : "text-yellow-700"}`}>
                    ⚠️ لم تكمل الحد الأدنى المطلوب (50%) من الإجابات التالية
                  </p>
                  <p className={`text-xs mt-2 ${dark ? "text-yellow-200" : "text-yellow-600"}`}>
                    يرجى إكمال الأسئلة أدناه لتكون مؤهلاً للحدث القادم
                  </p>
                </div>

                {/* Incomplete Vibe Questions */}
                {Object.entries(incompleteVibeQuestions).map(([key, info]) => {
                  const currentLength = (vibeAnswers[key] || "").length
                  const remaining = info.required - currentLength
                  const isBelowMinimum = currentLength < info.required
                  
                  return (
                    <div key={key} className={`p-4 rounded-xl border ${dark ? "bg-purple-500/10 border-purple-400/30" : "bg-purple-50 border-purple-200"}`}>
                      <p className={`text-sm font-medium mb-2 ${dark ? "text-purple-300" : "text-purple-700"}`}>
                        {info.label}
                      </p>
                      <textarea
                        value={vibeAnswers[key] || ""}
                        onChange={(e) => {
                          const newValue = e.target.value
                          if (newValue.length <= info.max) {
                            setVibeAnswers(prev => ({ ...prev, [key]: newValue }))
                          }
                        }}
                        placeholder="اكتب إجابتك هنا..."
                        className={`w-full min-h-[80px] text-right border-2 rounded-lg px-3 py-2 text-sm resize-y ${
                          isBelowMinimum
                            ? dark 
                              ? 'border-yellow-600 focus:border-yellow-500 bg-slate-700 text-slate-100' 
                              : 'border-yellow-300 focus:border-yellow-500 bg-white text-gray-800'
                            : dark
                              ? 'border-green-600 focus:border-green-500 bg-slate-700 text-slate-100'
                              : 'border-green-300 focus:border-green-500 bg-white text-gray-800'
                        }`}
                      />
                      <div className="flex justify-between items-center mt-2 text-xs">
                        <span className={`font-medium ${
                          isBelowMinimum 
                            ? dark ? 'text-yellow-400' : 'text-yellow-600'
                            : dark ? 'text-green-400' : 'text-green-600'
                        }`}>
                          {currentLength}/{info.max} حرف (الحد الأدنى: {info.required})
                        </span>
                        {isBelowMinimum ? (
                          <span className={`font-medium ${dark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                            يحتاج {remaining} حرف إضافي
                          </span>
                        ) : (
                          <span className={`font-medium ${dark ? 'text-green-400' : 'text-green-600'}`}>
                            ✓ مكتمل
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                
                {/* Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowVibeCompletionPopup(false)
                      setIncompleteVibeQuestions({})
                      setVibeAnswers({})
                    }}
                    disabled={vibeLoading}
                    className={`flex-1 px-4 py-3 rounded-xl border transition-all duration-300 ${
                      dark 
                        ? "bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50" 
                        : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"
                    } disabled:opacity-50`}
                  >
                    إغلاق
                  </button>
                  
                  <button
                    onClick={handleVibeCompletionSubmit}
                    disabled={vibeLoading}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {vibeLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        جاري الحفظ...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        حفظ التحديثات
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Survey Recovery Popup (technical issue) - Top Level (highest priority)
  if (showSurveyRecoveryPopup && surveyRecoveryInfo) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className={`max-w-md w-full max-h-[90vh] rounded-2xl shadow-2xl border-2 ${dark ? "bg-slate-800/90 border-slate-600" : "bg-white/90 border-gray-200"} flex flex-col`} dir="rtl">
          <div className="p-6 overflow-y-auto">
            <h2 className={`text-xl font-bold mb-2 ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
              حدث خلل تقني في بياناتك
            </h2>
            <p className={`${dark ? 'text-slate-300' : 'text-gray-700'} leading-relaxed`}>
              نعتذر عن الإزعاج. لاحظنا أن بعض معلوماتك مثل الاسم أو إجابات الاستبيان غير محفوظة، بينما تم حفظ تفضيلات التفاعل.
              لضمان أفضل تجربة ومطابقة دقيقة، يُرجى إعادة تعبئة الاستبيان.
            </p>

            <div className={`mt-4 p-3 rounded-lg ${dark ? 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/30' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
              <div className="text-sm">
                رقم المشارك: <span className="font-bold">#{surveyRecoveryInfo.assigned_number}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-5">
              <button
                onClick={() => {
                  setShowSurveyRecoveryPopup(false)
                }}
                className={`flex-1 px-4 py-3 rounded-xl border transition-all duration-300 ${
                  dark 
                    ? "bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50" 
                    : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"
                }`}
              >
                لاحقاً
              </button>

              <button
                onClick={() => {
                  // Prefer secure_token from server; fall back to any stored token
                  const token = surveyRecoveryInfo.secure_token 
                    || secureToken 
                    || resultToken 
                    || returningPlayerToken 
                    || (typeof window !== 'undefined' && (localStorage.getItem('blindmatch_result_token') || localStorage.getItem('blindmatch_returning_token')));
                  if (token) {
                    // Navigate to welcome page with token and a redo hint
                    window.location.href = `/welcome?token=${encodeURIComponent(String(token))}&redo=1`;
                  } else {
                    // Fallback to in-place open if token missing
                    setShowSurveyRecoveryPopup(false)
                    setStep(2)
                    setShowSurvey(true)
                    setTimeout(() => setIsEditingSurvey(true), 100)
                  }
                }}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl transition-all duration-300"
              >
                إعادة تعبئة الاستبيان الآن
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Survey Completion Popup - Top Level (before any conditional returns)
  if (showSurveyCompletionPopup && incompleteSurveyInfo) {
    return (
      <div className="min-h-screen relative overflow-hidden page-bg" dir="rtl">
        {/* Background Animation */}
        <div className="absolute inset-0">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className={`absolute rounded-full blur-xl opacity-20 animate-pulse ${
                i % 2 === 0 ? 'bg-orange-400' : 'bg-red-500'
              }`}
              style={{
                width: `${32 + (i % 3) * 24}px`,
                height: `${32 + (i % 3) * 24}px`,
                left: `${10 + i * 12}%`,
                top: `${15 + (i % 4) * 20}%`,
                animationDelay: `${i * 0.8}s`,
                animationDuration: `${4 + (i % 3)}s`,
              }}
            />
          ))}
        </div>

        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`max-w-md w-full max-h-[90vh] rounded-2xl shadow-2xl border-2 ${dark ? "bg-slate-800/95 border-slate-600" : "bg-white/95 border-gray-200"} flex flex-col`}>
            <div className="p-6 overflow-y-auto">
              <div className="text-center space-y-4">
                {/* Header */}
                <div className="flex items-center justify-center mb-4">
                  <div className="p-3 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-full border border-orange-400/30">
                    <AlertCircle className="w-8 h-8 text-orange-400" />
                  </div>
                </div>

                <h3 className={`text-xl font-bold ${dark ? "text-slate-100" : "text-gray-800"}`}>
                  مرحباً {incompleteSurveyInfo.name}!
                </h3>

                <p className={`text-sm ${dark ? "text-slate-300" : "text-gray-600"}`}>
                  المشارك رقم #{incompleteSurveyInfo.assigned_number}
                </p>

                <div className={`p-6 rounded-2xl border ${dark ? "bg-gradient-to-br from-orange-500/20 to-yellow-500/20 border-orange-400/30 backdrop-blur-lg" : "bg-orange-50 border-orange-200"}`}>
                  <div className="flex items-center">
                    <div className={`p-3 rounded-full ${dark ? "bg-orange-500/20" : "bg-orange-100"}`}>
                      <FileText size={24} className={`${dark ? "text-orange-300" : "text-orange-600"}`} />
                    </div>
                    <div className="ml-4">
                      <p className={`text-lg font-bold ${dark ? "text-orange-200" : "text-orange-800"}`}>
                        📝 تحديثات مهمة في الاستبيان
                      </p>
                      <p className={`text-sm mt-1 ${dark ? "text-orange-300" : "text-orange-700"}`}>
                        لقد أضفنا أسئلة جديدة وحسّنا بعض الأسئلة الحالية. يرجى إكمال الاستبيان المحدث لضمان أفضل المطابقات لك.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowSurveyCompletionPopup(false)}
                    className={`flex-1 px-4 py-3 rounded-xl border transition-all duration-300 ${
                      dark 
                        ? "bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50" 
                        : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    إغلاق
                  </button>

                  <button
                    onClick={() => {
                      setShowSurveyCompletionPopup(false);
                      // Navigate to survey with the secure token and flag redo flow to auto-open editing
                      const t = encodeURIComponent(incompleteSurveyInfo.secure_token);
                      window.location.href = `/welcome?token=${t}&redo=1`;
                    }}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white rounded-xl transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    إكمال الاستبيان
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Token validation loading UI
  if (token && isResolving) {
    return (
      <div className="min-h-screen relative overflow-hidden page-bg" dir="rtl">
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
            <div className="bg-white/15 backdrop-blur-2xl border border-cyan-400/40 rounded-2xl p-8 shadow-2xl ring-1 ring-white/10">
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
      <>
        <NavigationBar />
        <LogoHeader />
        <BottomLeftContactButton />
        <ParticipantIcon />
        <div className="min-h-screen relative overflow-hidden page-bg" dir="rtl">
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
            <div className="bg-white/15 backdrop-blur-2xl border border-red-400/40 rounded-2xl p-8 shadow-2xl ring-1 ring-white/10">
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
      </>
    )
  }

  // Registration UI if no token
  if (!token) {
    return (
      <>
        {/* New User Type Popup */}
        {showNewUserTypePopup && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="max-w-md w-full bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-xl border border-slate-600/50 rounded-2xl shadow-2xl p-6 relative" dir="rtl">
              {/* Top Left Help Button */}
              <button
                onClick={() => setShowInfoPopup(true)}
                className="absolute top-4 left-4 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 rounded-xl px-3 py-2 flex items-center gap-2 hover:from-cyan-500/30 hover:to-blue-500/30 transition-all duration-300"
                title="اضغط لمعرفة المزيد عن الفعالية"
              >
                <HelpCircle className="w-4 h-4 text-cyan-300" />
                <span className="text-cyan-300 text-xs font-medium">شرح الفعالية</span>
                {/* Pulsing indicator */}
                <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400/60 animate-ping"></div>
              </button>

              {/* Top Right FAQ Button */}
              <button
                onClick={() => setShowFAQPopup(true)}
                className="absolute top-4 right-4 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-400/30 rounded-xl px-3 py-2 flex items-center gap-2 hover:from-orange-500/30 hover:to-red-500/30 transition-all duration-300"
                title="الأسئلة الشائعة"
              >
                <HelpCircle className="w-4 h-4 text-orange-300" />
                <span className="text-orange-300 text-xs font-medium">أسئلة شائعة</span>
                {/* Pulsing indicator */}
                <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-orange-400/60 animate-ping"></div>
              </button>
              
              {/* Header with centered logo */}
              <div className="text-center mb-6">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                    <UserPlus className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div className="flex items-center justify-center mb-4">
                  <h3 className="text-xl font-bold text-white">مرحباً بك!</h3>
                </div>
                <p className="text-slate-300 text-sm">هل سبق لك التسجيل في فعالياتنا من قبل؟</p>
              </div>
              
              <div className="space-y-4">
                {/* Returning User Option */}
                <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-400/30 rounded-xl p-5 hover:from-green-500/20 hover:to-emerald-500/20 transition-all duration-300">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                      <RotateCcw className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white">نعم، لدي رمز مميز</h4>
                      <p className="text-green-200 text-xs">تواصل مع المنظم في حال نسيانك للرمز</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={newUserTokenInput}
                      onChange={(e) => setNewUserTokenInput(e.target.value)}
                      placeholder="أدخل الرمز المميز"
                      className="w-full px-4 py-3 text-sm rounded-lg border bg-slate-700/50 border-slate-600 text-white placeholder-slate-400 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                      dir="ltr"
                    />
                    <button
                      onClick={handleReturningUserToken}
                      disabled={newUserTokenLoading || !newUserTokenInput.trim()}
                      className="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
                    >
                      {newUserTokenLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          <span>جاري التحقق...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>استعادة البيانات</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* New User Option */}
                <button
                  onClick={handleNewUserDirect}
                  className="w-full bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-400/30 rounded-xl p-5 hover:from-cyan-500/20 hover:to-blue-500/20 transition-all duration-300 transform hover:scale-[1.02]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-right">
                      <h4 className="text-base font-bold text-white mb-1">لا، أنا مشارك جديد</h4>
                      <p className="text-cyan-200 text-xs">لا يسمح بإنشاء أكثر من حساب</p>
                    </div>
                    <ChevronLeft className="w-5 h-5 text-cyan-300 transform rotate-180 ml-auto" />
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Info Popup */}
        {showInfoPopup && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="max-w-2xl w-full max-h-[90vh] p-4 sm:p-6 overflow-y-auto" dir="rtl">
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center mx-auto mb-3">
                  <HelpCircle className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white mb-2">كيف يعمل النظام؟</h3>
                <p className="text-cyan-200 text-xs sm:text-sm">نظام توافق شخصي متقدم حيث لا يُسمح للمشاركين بالكشف عن أسمائهم وأعمارهم إلا في حالة التطابق المتبادل في النهاية</p>
              </div>
              
              {/* Features Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-3 text-center shadow-lg">
                  <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <Users className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">لقاءات ذكية</h4>
                  <p className="text-cyan-200 text-xs">تبدأ بجلوس مع مجموعة لمدة 20-30 دقيقة ثم لقاءات فردية</p>
                </div>
                
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-3 text-center shadow-lg">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <Brain className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">تحليل متقدم</h4>
                  <p className="text-cyan-200 text-xs">ذكاء اصطناعي يحلل شخصيتك ويجد أفضل التوافقات</p>
                </div>
                
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-3 text-center shadow-lg">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <Target className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">نتائج دقيقة</h4>
                  <p className="text-cyan-200 text-xs">احصل على تقييم دقيق لدرجة التوافق مع كل شخص</p>
                </div>
              </div>
              
              <div className="space-y-6 sm:space-y-8">
                {/* Step 1 */}
                <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-lg sm:text-xl">1</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2">املأ استبيان التوافق</h3>
                    <p className="text-cyan-200 text-sm sm:text-base mb-3">
                      أجب على أسئلة شخصية مدروسة لتحليل شخصيتك وتفضيلاتك بدقة
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-lg sm:text-xl">2</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2">تحليل ذكي للتوافق</h3>
                    <p className="text-cyan-200 text-sm sm:text-base mb-3">
                      الذكاء الاصطناعي يحلل جميع المشاركين ويجد أكثر الأشخاص توافقاً معك
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-lg sm:text-xl">3</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2">تواصل عبر واتساب</h3>
                    <p className="text-cyan-200 text-sm sm:text-base mb-3">
                      سيتم التواصل معك عبر واتساب للدفع وتأكيد حضورك للفعالية
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-lg sm:text-xl">4</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2">لقاء وقرار التطابق</h3>
                    <p className="text-cyan-200 text-sm sm:text-base mb-3">
                      تلتقي بالشخص وتقرر إذا كنت تريد التطابق ومشاركة معلوماتك الشخصية أم لا - كل شيء يحدث بسلاسة على الموقع
                    </p>
                  </div>
                </div>
                
                {/* Privacy Notice */}
                <div className="mt-4 p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg shadow-md">
                  <div className="flex items-start gap-3">
                    <Shield className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-white font-semibold mb-1 text-sm">حماية الخصوصية</h4>
                      <p className="text-cyan-200 text-xs">
                        معلوماتك الشخصية محمية تماماً ولن تُشارك إلا في حالة التطابق المتبادل بين الطرفين
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Contact and Close Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowInfoPopup(false);
                    setShowContactForm(true);
                  }}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-700 hover:from-purple-700 hover:to-pink-800 text-white rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">تواصل معنا</span>
                </button>
                <button
                  onClick={() => setShowInfoPopup(false)}
                  className="flex-1 px-4 py-3 bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-all duration-300"
                >
                  <span className="text-sm font-medium">إغلاق</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FAQ Popup */}
        {showFAQPopup && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="max-w-4xl w-full max-h-[90vh] p-4 sm:p-6 overflow-y-auto" dir="rtl">
              <div className="bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-xl border border-slate-600/50 rounded-2xl shadow-2xl p-6">
                {/* Header */}
                <div className="text-center mb-6">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center mx-auto mb-3">
                    <HelpCircle className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-2">الأسئلة الشائعة</h3>
                  <p className="text-orange-200 text-xs sm:text-sm">إجابات شاملة على أهم الأسئلة حول منصة التوافق الفكري</p>
                </div>

                {/* FAQ Content */}
                <div className="space-y-4 mb-6">
                  {/* Platform Purpose */}
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 shadow-lg">
                    <h4 className="text-base font-bold text-orange-300 mb-2 flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      ما هو الهدف من هذه المنصة؟
                    </h4>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      منصة التوافق الفكري هي منصة احترافية تهدف إلى ربط الأشخاص ذوي التفكير المتشابه والاهتمامات المتوافقة لبناء علاقات فكرية وثقافية هادفة. 
                      نحن لسنا منصة مواعدة، بل مساحة آمنة للتبادل الفكري والثقافي بين الأشخاص المتوافقين فكرياً وشخصياً.
                    </p>
                  </div>

                  {/* Nationality Policy */}
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 shadow-lg">
                    <h4 className="text-base font-bold text-orange-300 mb-2 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      هل يمكنني اختيار جنسية معينة؟
                    </h4>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      لا، لا يُسمح باختيار جنسية محددة. نحن نؤمن بالتنوع الثقافي والفكري، ونهدف إلى كسر الحواجز وبناء جسور التفاهم بين جميع الثقافات والجنسيات. 
                      التوافق الفكري والشخصي أهم من الخلفية الجغرافية.
                    </p>
                  </div>

                  {/* Age Matching */}
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 shadow-lg">
                    <h4 className="text-base font-bold text-orange-300 mb-2 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      كيف يتم التوافق حسب العمر؟
                    </h4>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      يتم التوافق مع أشخاص قريبين من عمرك لضمان التجانس في مراحل الحياة والاهتمامات. 
                      الفارق العمري المسموح لا يتجاوز 5 سنوات إلا في حالات معينة، مما يضمن وجود أرضية مشتركة للحديث والتفاهم.
                    </p>
                  </div>

                  {/* Repeat Matching */}
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 shadow-lg">
                    <h4 className="text-base font-bold text-orange-300 mb-2 flex items-center gap-2">
                      <RotateCcw className="w-4 h-4" />
                      هل سأتم مطابقتي مع نفس الأشخاص مرة أخرى؟
                    </h4>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      لا، لن يتم مطابقتك مع نفس الشخص في جلستين متتاليتين. نظامنا الذكي يضمن التنويع في المطابقات 
                      لتتيح لك فرصة التعرف على أكبر عدد من الأشخاص المتوافقين معك فكرياً.
                    </p>
                  </div>

                  {/* Session Duration */}
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 shadow-lg">
                    <h4 className="text-base font-bold text-orange-300 mb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      كم تستغرق الجلسات؟
                    </h4>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      <strong className="text-orange-200">الجلسات الجماعية:</strong> 30 دقيقة مع مجموعة من 4-6 أشخاص<br/>
                      <strong className="text-orange-200">الجلسات الفردية:</strong> 30 دقيقة كحد أدنى، لكن يمكنكما الاستمرار كما تشاءان<br/>
                      هذا التوقيت مصمم لإتاحة فرصة كافية للتعارف دون إرهاق أو ملل.
                    </p>
                  </div>

                  {/* Activities Provided */}
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 shadow-lg">
                    <h4 className="text-base font-bold text-orange-300 mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      ما الأنشطة المتوفرة؟
                    </h4>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      <strong className="text-orange-200">للجلسات الفردية:</strong> أسئلة محفزة للحوار ومواضيع نقاش متنوعة<br/>
                      <strong className="text-orange-200">للجلسات الجماعية:</strong> 4 أنشطة تفاعلية مختلفة تشمل ألعاب كسر الجليد، 
                      أسئلة التعارف، وأنشطة بناء الفريق لضمان تجربة ممتعة ومفيدة.
                    </p>
                  </div>

                  {/* Privacy & Safety */}
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 shadow-lg">
                    <h4 className="text-base font-bold text-orange-300 mb-2 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      كيف تضمنون الخصوصية والأمان؟
                    </h4>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      نحن ملتزمون بأعلى معايير الخصوصية والأمان. جميع البيانات محمية بتشفير متقدم، ولا يتم مشاركة المعلومات الشخصية 
                      إلا في حالة التوافق المتبادل. كما نوفر بيئة آمنة ومراقبة لضمان احترام جميع المشاركين.
                    </p>
                  </div>

                  {/* Platform Values */}
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 shadow-lg">
                    <h4 className="text-base font-bold text-orange-300 mb-2 flex items-center gap-2">
                      <Heart className="w-4 h-4" />
                      ما قيمنا ومبادئنا؟
                    </h4>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      نؤمن بالاحترام المتبادل، التنوع الثقافي، والتبادل الفكري الهادف. نسعى لبناء مجتمع من المفكرين والمثقفين 
                      الذين يقدرون الحوار البناء والعلاقات الإنسانية القائمة على التفاهم والاحترام المتبادل.
                    </p>
                  </div>
                </div>

                {/* Close Button */}
                <div className="flex justify-center">
                  <button
                    onClick={() => setShowFAQPopup(false)}
                    className="px-6 py-3 bg-gradient-to-r from-orange-600 to-red-700 hover:from-orange-700 hover:to-red-800 text-white rounded-xl transition-all duration-300 flex items-center gap-2 font-medium"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>فهمت، شكراً</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Contact Form Popup */}
        {showContactForm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`max-w-md w-full max-h-[90vh] rounded-2xl shadow-2xl border-2 ${dark ? "bg-slate-800 border-slate-600" : "bg-white border-gray-200"} flex flex-col`} dir="rtl">
              <div className="p-4 overflow-y-auto">
                {/* Header */}
                <div className="text-center mb-4">
                  <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${dark ? "bg-purple-500/20" : "bg-purple-100"}`}>
                    <Mail className={`w-6 h-6 ${dark ? "text-purple-400" : "text-purple-600"}`} />
                  </div>
                  <h3 className={`text-lg font-bold mb-1 ${dark ? "text-slate-100" : "text-gray-800"}`}>
                    تواصل معنا
                  </h3>
                  <p className={`text-xs ${dark ? "text-slate-300" : "text-gray-600"}`}>
                    نحن هنا للمساعدة! أرسل لنا رسالتك وسنتواصل معك قريباً
                  </p>
                </div>

                {/* Contact Form */}
                <form onSubmit={handleContactSubmit} className="space-y-3">
                  {/* Name Field */}
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                      {participantName && assignedNumber ? "المشارك" : "الاسم (اختياري)"}
                    </label>
                    <input
                      type="text"
                      value={contactForm.name}
                      onChange={(e) => handleContactInputChange('name', e.target.value)}
                      placeholder="أدخل اسمك"
                      readOnly={!!(participantName && assignedNumber)}
                      className={`w-full px-2 py-1.5 text-sm rounded-md border transition-colors ${
                        participantName && assignedNumber
                          ? dark 
                            ? "bg-slate-600 border-slate-500 text-slate-100 cursor-not-allowed" 
                            : "bg-gray-100 border-gray-300 text-gray-700 cursor-not-allowed"
                          : dark 
                            ? "bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400 focus:border-purple-400" 
                            : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500"
                      } ${!(participantName && assignedNumber) ? 'focus:outline-none focus:ring-2 focus:ring-purple-500/20' : ''}`}
                    />
                  </div>

                  {/* Email Field */}
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                      البريد الإلكتروني *
                    </label>
                    <input
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => handleContactInputChange('email', e.target.value)}
                      placeholder="example@email.com"
                      required
                      className={`w-full px-2 py-1.5 text-sm rounded-md border transition-colors ${
                        dark 
                          ? "bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400 focus:border-purple-400" 
                          : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500"
                      } focus:outline-none focus:ring-2 focus:ring-purple-500/20`}
                      dir="ltr"
                    />
                  </div>

                  {/* Phone Field */}
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                      رقم الهاتف *
                    </label>
                    <input
                      type="tel"
                      value={contactForm.phone}
                      onChange={(e) => handleContactInputChange('phone', e.target.value)}
                      placeholder="05xxxxxxxx"
                      required
                      className={`w-full px-2 py-1.5 text-sm rounded-md border transition-colors ${
                        dark 
                          ? "bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400 focus:border-purple-400" 
                          : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500"
                      } focus:outline-none focus:ring-2 focus:ring-purple-500/20`}
                      dir="ltr"
                    />
                  </div>

                  {/* Subject Field */}
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                      الموضوع (اختياري)
                    </label>
                    <input
                      type="text"
                      value={contactForm.subject}
                      onChange={(e) => handleContactInputChange('subject', e.target.value)}
                      placeholder="موضوع الرسالة"
                      className={`w-full px-2 py-1.5 text-sm rounded-md border transition-colors ${
                        dark 
                          ? "bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400 focus:border-purple-400" 
                          : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500"
                      } focus:outline-none focus:ring-2 focus:ring-purple-500/20`}
                    />
                  </div>

                  {/* Message Field */}
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                      الرسالة *
                    </label>
                    <textarea
                      value={contactForm.message}
                      onChange={(e) => handleContactInputChange('message', e.target.value)}
                      placeholder="اكتب رسالتك هنا..."
                      required
                      rows={3}
                      className={`w-full px-2 py-1.5 text-sm rounded-md border transition-colors resize-none ${
                        dark 
                          ? "bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400 focus:border-purple-400" 
                          : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500"
                      } focus:outline-none focus:ring-2 focus:ring-purple-500/20`}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowContactForm(false);
                        setContactForm({ email: "", name: "", phone: "", message: "", subject: "" });
                      }}
                      className={`flex-1 px-3 py-1.5 text-sm rounded-md border transition-all duration-300 ${
                        dark 
                          ? "border-slate-600 text-slate-300 hover:bg-slate-700" 
                          : "border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={contactFormLoading || !contactForm.email || !contactForm.message || !contactForm.phone}
                      className="flex-1 px-3 py-1.5 text-sm bg-gradient-to-r from-purple-600 to-pink-700 hover:from-purple-700 hover:to-pink-800 text-white rounded-md transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {contactFormLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          جاري الإرسال...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          إرسال
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Next Event Signup Popup - Moved to top level */}
        {showNextEventPopup && participantInfo && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`max-w-md w-full max-h-[90vh] rounded-2xl shadow-2xl border-2 ${dark ? "bg-slate-800/90 border-slate-600" : "bg-white/90 border-gray-200"} flex flex-col`} dir="rtl">
              <div className="p-6 overflow-y-auto">
                <div className="text-center space-y-4">
                {/* Header */}
                <div className="flex items-center justify-center mb-4">
                  <div className="p-3 bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-full border border-green-400/30">
                    <UserRound className="w-8 h-8 text-green-400" />
                  </div>
                </div>
                
                <h3 className={`text-xl font-bold ${dark ? "text-slate-100" : "text-gray-800"}`}>
                  مرحباً {participantInfo.name}!
                </h3>
                
                <p className={`text-sm ${dark ? "text-slate-300" : "text-gray-600"}`}>
                  المشارك رقم #{participantInfo.assigned_number}
                </p>
                
                <div className={`p-4 rounded-xl border ${dark ? "bg-green-500/10 border-green-400/30" : "bg-green-50 border-green-200"}`}>
                  <p className={`text-sm font-medium ${dark ? "text-green-300" : "text-green-700"}`}>
                    🎉 هل تريد التسجيل للحدث القادم؟
                  </p>
                  <p className={`text-xs mt-2 ${dark ? "text-green-200" : "text-green-600"}`}>
                    سيتم تسجيلك تلقائياً باستخدام بياناتك المحفوظة
                  </p>
                </div>

                {/* Gender Preference Options
                <div className={`p-4 rounded-xl border ${dark ? "bg-blue-500/10 border-blue-400/30" : "bg-blue-50 border-blue-200"}`}>
                  <p className={`text-sm font-medium mb-3 ${dark ? "text-blue-300" : "text-blue-700"}`}>
                    تفضيلات التواصل (اختياري)
                  </p>
                  <p className={`text-xs mb-3 ${dark ? "text-blue-200" : "text-blue-600"}`}>
                    إذا لم تحدد، سيتم التوافق مع الجنس الآخر
                  </p>
                  <RadioGroup 
                    value={returningGenderPreference} 
                    onValueChange={setReturningGenderPreference}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value="opposite_gender" id="popup-opposite-gender" className={`${dark ? "border-blue-400/50 text-blue-400" : "border-blue-500/50 text-blue-500"}`} />
                      <Label htmlFor="popup-opposite-gender" className={`text-sm cursor-pointer ${dark ? "text-blue-200" : "text-blue-700"}`}>
                        الجنس الآخر (افتراضي)
                      </Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value="same_gender" id="popup-same-gender" className={`${dark ? "border-blue-400/50 text-blue-400" : "border-blue-500/50 text-blue-500"}`} />
                      <Label htmlFor="popup-same-gender" className={`text-sm cursor-pointer ${dark ? "text-blue-200" : "text-blue-700"}`}>
                        نفس الجنس فقط
                      </Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value="any_gender" id="popup-any-gender" className={`${dark ? "border-blue-400/50 text-blue-400" : "border-blue-500/50 text-blue-500"}`} />
                      <Label htmlFor="popup-any-gender" className={`text-sm cursor-pointer ${dark ? "text-blue-200" : "text-blue-700"}`}>
                        أي جنس (ذكر أو أنثى)
                      </Label>
                    </div>
                  </RadioGroup>
                </div> */}

                {/* Show other questions only if they haven't been filled in database */}
                {(!participantHasHumorStyle || !participantHasOpennessComfort) && (
                  <>
                    {/* Humor/Banter Style */}
                    {!participantHasHumorStyle && (
                      <div className={`p-4 rounded-xl border ${dark ? "bg-purple-500/10 border-purple-400/30" : "bg-purple-50 border-purple-200"}`}>
                        <p className={`text-sm font-medium mb-3 ${dark ? "text-purple-300" : "text-purple-700"}`}>
                          أسلوب التفاعل (مطلوب)
                        </p>
                        <p className={`text-xs mb-3 ${dark ? "text-purple-200" : "text-purple-600"}`}>
                          في أول 10 دقائق، ما هو الأسلوب الذي يبدو طبيعياً لك؟
                        </p>
                        <RadioGroup 
                          value={returningHumorStyle} 
                          onValueChange={setReturningHumorStyle}
                          className="space-y-2"
                        >
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="A" id="next-humor-A" className={`${dark ? "border-purple-400/50 text-purple-400" : "border-purple-500/50 text-purple-500"}`} />
                            <Label htmlFor="next-humor-A" className={`text-sm cursor-pointer ${dark ? "text-purple-200" : "text-purple-700"}`}>
                              المزاح والمرح
                            </Label>
                          </div>
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="B" id="next-humor-B" className={`${dark ? "border-purple-400/50 text-purple-400" : "border-purple-500/50 text-purple-500"}`} />
                            <Label htmlFor="next-humor-B" className={`text-sm cursor-pointer ${dark ? "text-purple-200" : "text-purple-700"}`}>
                              النكات الودودة الخفيفة
                            </Label>
                          </div>
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="C" id="next-humor-C" className={`${dark ? "border-purple-400/50 text-purple-400" : "border-purple-500/50 text-purple-500"}`} />
                            <Label htmlFor="next-humor-C" className={`text-sm cursor-pointer ${dark ? "text-purple-200" : "text-purple-700"}`}>
                              الصدق والدفء
                            </Label>
                          </div>
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="D" id="next-humor-D" className={`${dark ? "border-purple-400/50 text-purple-400" : "border-purple-500/50 text-purple-500"}`} />
                            <Label htmlFor="next-humor-D" className={`text-sm cursor-pointer ${dark ? "text-purple-200" : "text-purple-700"}`}>
                              المباشرة والجدية
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    )}

                    {/* Early Openness Comfort */}
                    {!participantHasOpennessComfort && (
                      <div className={`p-4 rounded-xl border ${dark ? "bg-orange-500/10 border-orange-400/30" : "bg-orange-50 border-orange-200"}`}>
                        <p className={`text-sm font-medium mb-3 ${dark ? "text-orange-300" : "text-orange-700"}`}>
                          مستوى الانفتاح المبكر (مطلوب)
                        </p>
                        <p className={`text-xs mb-3 ${dark ? "text-orange-200" : "text-orange-600"}`}>
                          عندما تقابل شخصاً جديداً، ما الذي يبدو مناسباً لك؟
                        </p>
                        <RadioGroup 
                          value={returningOpennessComfort} 
                          onValueChange={setReturningOpennessComfort}
                          className="space-y-2"
                        >
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="0" id="next-openness-0" className={`${dark ? "border-orange-400/50 text-orange-400" : "border-orange-500/50 text-orange-500"}`} />
                            <Label htmlFor="next-openness-0" className={`text-sm cursor-pointer ${dark ? "text-orange-200" : "text-orange-700"}`}>
                              أحتفظ بالأمور الشخصية حتى أتعرف عليهم جيداً
                            </Label>
                          </div>
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="1" id="next-openness-1" className={`${dark ? "border-orange-400/50 text-orange-400" : "border-orange-500/50 text-orange-500"}`} />
                            <Label htmlFor="next-openness-1" className={`text-sm cursor-pointer ${dark ? "text-orange-200" : "text-orange-700"}`}>
                              أفضل الحديث السطحي في البداية
                            </Label>
                          </div>
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="2" id="next-openness-2" className={`${dark ? "border-orange-400/50 text-orange-400" : "border-orange-500/50 text-orange-500"}`} />
                            <Label htmlFor="next-openness-2" className={`text-sm cursor-pointer ${dark ? "text-orange-200" : "text-orange-700"}`}>
                              أحب المشاركة المتوازنة - مزيج من الخفيف والحقيقي
                            </Label>
                          </div>
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="3" id="next-openness-3" className={`${dark ? "border-orange-400/50 text-orange-400" : "border-orange-500/50 text-orange-500"}`} />
                            <Label htmlFor="next-openness-3" className={`text-sm cursor-pointer ${dark ? "text-orange-200" : "text-orange-700"}`}>
                              أنفتح بسرعة وأشارك القصص الشخصية
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    )}
                  </>
                )}

                {/* Auto Signup Checkbox */}
                <div className={`p-4 rounded-xl border ${dark ? "bg-cyan-500/10 border-cyan-400/30" : "bg-cyan-50 border-cyan-200"}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="auto-signup-next-popup"
                      checked={autoSignupNextEvent}
                      onChange={(e) => setAutoSignupNextEvent(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-cyan-400/50 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-0 cursor-pointer"
                    />
                    <div className="flex-1">
                      <Label htmlFor="auto-signup-next-popup" className={`text-sm font-medium cursor-pointer ${dark ? "text-cyan-300" : "text-cyan-700"}`}>
                        ✨ سجلني تلقائياً في جميع الأحداث القادمة
                      </Label>
                      <p className={`text-xs mt-1 ${dark ? "text-cyan-200" : "text-cyan-600"}`}>
                        لن تحتاج للتسجيل يدوياً في كل حدث - سيتم تسجيلك تلقائياً
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowNextEventPopup(false)
                      setReturningHumorStyle("") // Reset humor style
                      setReturningOpennessComfort("") // Reset openness comfort
                      setAutoSignupNextEvent(false) // Reset auto signup
                    }}
                    disabled={nextEventSignupLoading}
                    className={`flex-1 px-4 py-3 rounded-xl border transition-all duration-300 ${
                      dark 
                        ? "bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50" 
                        : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"
                    } disabled:opacity-50`}
                  >
                    ليس الآن
                  </button>
                  
                  <button
                    onClick={handleAutoSignupNextEvent}
                    disabled={nextEventSignupLoading || (!participantHasHumorStyle && !returningHumorStyle) || (!participantHasOpennessComfort && !returningOpennessComfort)}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white rounded-xl transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {nextEventSignupLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        جاري التسجيل...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        نعم، سجلني!
                      </>
                    )}
                  </button>
                </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Returning Participant Signup Popup */}
        {showReturningSignupPopup && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`max-w-md w-full max-h-[90vh] rounded-2xl shadow-2xl border-2 ${dark ? "bg-slate-800/90 border-slate-600" : "bg-white/90 border-gray-200"} flex flex-col`} dir="rtl">
              <div className="p-6 overflow-y-auto">
                <div className="text-center space-y-4">
                {/* Icon */}
                <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${dark ? "bg-green-500/20" : "bg-green-100"}`}>
                  <UserCheck className={`w-8 h-8 ${dark ? "text-green-400" : "text-green-600"}`} />
                </div>
                
                <h3 className={`text-xl font-bold ${dark ? "text-slate-100" : "text-gray-800"}`}>
                  تسجيل مشارك سابق
                </h3>
                
                <p className={`text-sm ${dark ? "text-slate-300" : "text-gray-600"}`}>
                  رقم الهاتف: {returningPhoneNumber}
                </p>
                
                <div className={`p-4 rounded-xl border ${dark ? "bg-green-500/10 border-green-400/30" : "bg-green-50 border-green-200"}`}>
                  <p className={`text-sm font-medium ${dark ? "text-green-300" : "text-green-700"}`}>
                    🎉 سيتم البحث عن بياناتك وتسجيلك للحدث القادم
                  </p>
                </div>

                {/* Gender Preference Options
                <div className={`p-4 rounded-xl border ${dark ? "bg-blue-500/10 border-blue-400/30" : "bg-blue-50 border-blue-200"}`}>
                  <p className={`text-sm font-medium mb-3 ${dark ? "text-blue-300" : "text-blue-700"}`}>
                    تفضيلات التواصل (اختياري)
                  </p>
                  <p className={`text-xs mb-3 ${dark ? "text-blue-200" : "text-blue-600"}`}>
                    إذا لم تحدد، سيتم التوافق مع الجنس الآخر
                  </p>
                  <RadioGroup 
                    value={returningGenderPreference} 
                    onValueChange={setReturningGenderPreference}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value="opposite_gender" id="signup-opposite-gender" className={`${dark ? "border-blue-400/50 text-blue-400" : "border-blue-500/50 text-blue-500"}`} />
                      <Label htmlFor="signup-opposite-gender" className={`text-sm cursor-pointer ${dark ? "text-blue-200" : "text-blue-700"}`}>
                        الجنس الآخر (افتراضي)
                      </Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value="same_gender" id="signup-same-gender" className={`${dark ? "border-blue-400/50 text-blue-400" : "border-blue-500/50 text-blue-500"}`} />
                      <Label htmlFor="signup-same-gender" className={`text-sm cursor-pointer ${dark ? "text-blue-200" : "text-blue-700"}`}>
                        نفس الجنس فقط
                      </Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value="any_gender" id="signup-any-gender" className={`${dark ? "border-blue-400/50 text-blue-400" : "border-blue-500/50 text-blue-500"}`} />
                      <Label htmlFor="signup-any-gender" className={`text-sm cursor-pointer ${dark ? "text-blue-200" : "text-blue-700"}`}>
                        أي جنس (ذكر أو أنثى)
                      </Label>
                    </div>
                  </RadioGroup>
                </div> */}

                {/* Show other questions only if they haven't been filled in database */}
                {(!participantHasHumorStyle || !participantHasOpennessComfort) && (
                  <>
                    {/* Humor/Banter Style */}
                    {!participantHasHumorStyle && (
                      <div className={`p-4 rounded-xl border ${dark ? "bg-purple-500/10 border-purple-400/30" : "bg-purple-50 border-purple-200"}`}>
                        <p className={`text-sm font-medium mb-3 ${dark ? "text-purple-300" : "text-purple-700"}`}>
                          أسلوب التفاعل (مطلوب)
                        </p>
                        <p className={`text-xs mb-3 ${dark ? "text-purple-200" : "text-purple-600"}`}>
                          في أول 10 دقائق، ما هو الأسلوب الذي يبدو طبيعياً لك؟
                        </p>
                        <RadioGroup 
                          value={returningHumorStyle} 
                          onValueChange={setReturningHumorStyle}
                          className="space-y-2"
                        >
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="A" id="humor-A" className={`${dark ? "border-purple-400/50 text-purple-400" : "border-purple-500/50 text-purple-500"}`} />
                            <Label htmlFor="humor-A" className={`text-sm cursor-pointer ${dark ? "text-purple-200" : "text-purple-700"}`}>
                              المزاح والمرح
                            </Label>
                          </div>
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="B" id="humor-B" className={`${dark ? "border-purple-400/50 text-purple-400" : "border-purple-500/50 text-purple-500"}`} />
                            <Label htmlFor="humor-B" className={`text-sm cursor-pointer ${dark ? "text-purple-200" : "text-purple-700"}`}>
                              النكات الودودة الخفيفة
                            </Label>
                          </div>
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="C" id="humor-C" className={`${dark ? "border-purple-400/50 text-purple-400" : "border-purple-500/50 text-purple-500"}`} />
                            <Label htmlFor="humor-C" className={`text-sm cursor-pointer ${dark ? "text-purple-200" : "text-purple-700"}`}>
                              الصدق والدفء
                            </Label>
                          </div>
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="D" id="humor-D" className={`${dark ? "border-purple-400/50 text-purple-400" : "border-purple-500/50 text-purple-500"}`} />
                            <Label htmlFor="humor-D" className={`text-sm cursor-pointer ${dark ? "text-purple-200" : "text-purple-700"}`}>
                              المباشرة والجدية
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    )}

                    {/* Early Openness Comfort */}
                    {!participantHasOpennessComfort && (
                      <div className={`p-4 rounded-xl border ${dark ? "bg-orange-500/10 border-orange-400/30" : "bg-orange-50 border-orange-200"}`}>
                        <p className={`text-sm font-medium mb-3 ${dark ? "text-orange-300" : "text-orange-700"}`}>
                          مستوى الانفتاح المبكر (مطلوب)
                        </p>
                        <p className={`text-xs mb-3 ${dark ? "text-orange-200" : "text-orange-600"}`}>
                          عندما تقابل شخصاً جديداً، ما الذي يبدو مناسباً لك؟
                        </p>
                        <RadioGroup 
                          value={returningOpennessComfort} 
                          onValueChange={setReturningOpennessComfort}
                          className="space-y-2"
                        >
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="0" id="openness-0" className={`${dark ? "border-orange-400/50 text-orange-400" : "border-orange-500/50 text-orange-500"}`} />
                            <Label htmlFor="openness-0" className={`text-sm cursor-pointer ${dark ? "text-orange-200" : "text-orange-700"}`}>
                              أحتفظ بالأمور الشخصية حتى أتعرف عليهم جيداً
                            </Label>
                          </div>
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="1" id="openness-1" className={`${dark ? "border-orange-400/50 text-orange-400" : "border-orange-500/50 text-orange-500"}`} />
                            <Label htmlFor="openness-1" className={`text-sm cursor-pointer ${dark ? "text-orange-200" : "text-orange-700"}`}>
                              أفضل الحديث السطحي في البداية
                            </Label>
                          </div>
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="2" id="openness-2" className={`${dark ? "border-orange-400/50 text-orange-400" : "border-orange-500/50 text-orange-500"}`} />
                            <Label htmlFor="openness-2" className={`text-sm cursor-pointer ${dark ? "text-orange-200" : "text-orange-700"}`}>
                              أحب المشاركة المتوازنة - مزيج من الخفيف والحقيقي
                            </Label>
                          </div>
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value="3" id="openness-3" className={`${dark ? "border-orange-400/50 text-orange-400" : "border-orange-500/50 text-orange-500"}`} />
                            <Label htmlFor="openness-3" className={`text-sm cursor-pointer ${dark ? "text-orange-200" : "text-orange-700"}`}>
                              أنفتح بسرعة وأشارك القصص الشخصية
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    )}
                  </>
                )}

                {/* Auto Signup Checkbox */}
                <div className={`p-4 rounded-xl border ${dark ? "bg-cyan-500/10 border-cyan-400/30" : "bg-cyan-50 border-cyan-200"}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="auto-signup-returning-popup"
                      checked={autoSignupNextEvent}
                      onChange={(e) => setAutoSignupNextEvent(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-cyan-400/50 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-0 cursor-pointer"
                    />
                    <div className="flex-1">
                      <Label htmlFor="auto-signup-returning-popup" className={`text-sm font-medium cursor-pointer ${dark ? "text-cyan-300" : "text-cyan-700"}`}>
                        ✨ سجلني تلقائياً في جميع الأحداث القادمة
                      </Label>
                      <p className={`text-xs mt-1 ${dark ? "text-cyan-200" : "text-cyan-600"}`}>
                        لن تحتاج للتسجيل يدوياً في كل حدث - سيتم تسجيلك تلقائياً
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowReturningSignupPopup(false)
                      setReturningHumorStyle("") // Reset humor style
                      setReturningOpennessComfort("") // Reset openness comfort
                      setAutoSignupNextEvent(false) // Reset auto signup
                    }}
                    disabled={returningLoading}
                    className={`flex-1 px-4 py-3 rounded-xl border transition-all duration-300 ${
                      dark 
                        ? "bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50" 
                        : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"
                    } disabled:opacity-50`}
                  >
                    إلغاء
                  </button>
                  
                  <button
                    onClick={handleReturningSignupSubmit}
                    disabled={returningLoading || !returningHumorStyle || !returningOpennessComfort}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white rounded-xl transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {returningLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        جاري التسجيل...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        تأكيد التسجيل
                      </>
                    )}
                  </button>
                </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <NavigationBar />
        <LogoHeader />
        <BottomLeftContactButton />
        <ParticipantIcon />
        <div className="min-h-screen relative overflow-hidden page-bg" dir="rtl">
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
                        <div className="relative flex items-center justify-center">
                          <img src={logoPng} alt="BlindMatch" className="w-24 h-24 sm:w-36 sm:h-36 object-contain" />
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
                {/* Gender preference pill moved into NavigationBar to avoid collision */}
                {/* Header Section */}
                <div className="text-center mb-4 sm:mb-5 pt-24 sm:pt-28 animate-in slide-in-from-bottom-4 duration-1000">
                  <div className="relative inline-block mb-6 sm:mb-8">
                      <div className="flex items-center justify-center mb-4 sm:mb-6">
                      </div>

                      {/* Main hero title/subtitle removed per design request */}
                      {/* Tagline moved into Process Guide card */}
                    </div>
                  </div>

                {/* Process Guide - Ultra Compact */}
                <div className={`max-w-4xl mx-auto -mt-10 mb-2 rounded-2xl circuit-card border overflow-hidden ${dark ? "bg-slate-900/80 border-slate-700/50 shadow-lg shadow-black/30" : "bg-gray-900/80 border-gray-700/50 shadow-lg"}`}>
                  <div className="pt-3 pb-3 animate-in slide-in-from-bottom-4 duration-1000 delay-700 text-center">
                  <div className="max-w-xl mx-auto mb-3">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${dark ? "bg-slate-900/80 border-slate-700/50 text-slate-200 shadow-lg shadow-black/30" : "bg-gray-900/80 border-gray-700/50 text-gray-200 shadow-lg"}`}>
                      <span className="text-[7px] font-medium">
                        هذا حدث فكري لتحدي وجهات النظر • هدفه اختبار التوافق الفكري والثقافي من خلال نقاشات جماعية ومحادثات فردية
                      </span>
                    </div>
                  </div>
                  <div className="max-w-xl mx-auto mb-3">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${dark ? "bg-slate-900/80 border-slate-700/50 text-slate-200 shadow-lg shadow-black/30" : "bg-gray-900/80 border-gray-700/50 text-gray-200 shadow-lg"}`}>
                      <AlertTriangle className="w-3 h-3" />
                      <span className="text-[7px] font-medium">
                        تنبيه: النتائج تقديرية مبنية على احتمالات وليست ضماناً، وقد تتأثر بدقة الإجابات والسياق.
                      </span>
                    </div>
                  </div>
                  <details className="group">
                      <summary className="flex w-full items-center justify-center gap-1.5 text-[13px] font-medium text-white cursor-pointer list-none hover:text-cyan-300 transition-colors px-4 py-2 rounded-none bg-gradient-to-r from-cyan-400/10 to-blue-500/10 border-y border-white/10">
                        <HelpCircle className="w-3.5 h-3.5 ml-1 text-cyan-300" />
                        <h2 className="inline">كيف يعمل النظام؟</h2>
                        <ChevronLeft className="w-3.5 h-3.5 mr-1 transition-transform duration-300 group-open:rotate-[-90deg] text-cyan-300" />
                      </summary>
                      
                      <div className="overflow-hidden transition-all duration-500 ease-in-out max-h-0 group-open:max-h-[1200px]">
                        <div>
                          {/* Features Grid - AI styled */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-1 -mt-3">
                            <div
                              className="ai-card ai-cut p-3 text-center"
                              style={{
                                ['--ai-b1' as any]: 'rgba(56,189,248,.55)',   // cyan-400
                                ['--ai-b2' as any]: 'rgba(99,102,241,.55)',   // indigo-500
                                ['--ai-b3' as any]: 'rgba(59,130,246,.55)',   // blue-500
                                background: 'linear-gradient(135deg, rgba(29,78,216,0.18), rgba(14,165,233,0.14))'
                              }}
                            >
                              <motion.div className="ai-ink">
                                <motion.span
                                  className="ai-ink__blob ai-ink__blob--1"
                                  initial={{ x: -30, y: -20 }}
                                  animate={{ x: [-30, 10, -15], y: [-20, 5, -20] }}
                                  transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
                                  style={{ width: 120, height: 120, top: '10%', left: '8%' }}
                                />
                                <motion.span
                                  className="ai-ink__blob ai-ink__blob--2"
                                  initial={{ x: 20, y: 10 }}
                                  animate={{ x: [20, -5, 25], y: [10, -15, 10] }}
                                  transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
                                  style={{ width: 100, height: 100, bottom: '12%', right: '10%' }}
                                />
                              </motion.div>
                              <div className="ai-icon ai-icon--ghost mx-auto mb-2">
                                <Users className="w-4 h-4 text-white" />
                              </div>
                              <h4 className="text-xs font-bold text-white mb-1">لقاءات ذكية</h4>
                              <p className="text-cyan-200 text-[11px]">تبدأ بجلوس مع مجموعة لمدة 20-30 دقيقة ثم لقاءات فردية</p>
                            </div>
                            
                            <div
                              className="ai-card ai-cut p-3 text-center"
                              style={{
                                ['--ai-b1' as any]: 'rgba(168,85,247,.55)',  // purple-500
                                ['--ai-b2' as any]: 'rgba(236,72,153,.55)',  // pink-500
                                ['--ai-b3' as any]: 'rgba(147,51,234,.55)',  // violet-600
                                background: 'linear-gradient(135deg, rgba(109,40,217,0.18), rgba(236,72,153,0.14))'
                              }}
                            >
                              <motion.div className="ai-ink">
                                <motion.span
                                  className="ai-ink__blob ai-ink__blob--2"
                                  initial={{ x: -20, y: -10 }}
                                  animate={{ x: [-20, 15, -10], y: [-10, 8, -10] }}
                                  transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
                                  style={{ width: 110, height: 110, top: '12%', left: '12%' }}
                                />
                                <motion.span
                                  className="ai-ink__blob ai-ink__blob--3"
                                  initial={{ x: 15, y: 20 }}
                                  animate={{ x: [15, -10, 20], y: [20, -6, 20] }}
                                  transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
                                  style={{ width: 90, height: 90, bottom: '10%', right: '12%' }}
                                />
                              </motion.div>
                              <div className="ai-icon ai-icon--ghost mx-auto mb-2">
                                <Brain className="w-4 h-4 text-white" />
                              </div>
                              <h4 className="text-xs font-bold text-white mb-1">تحليل متقدم</h4>
                              <p className="text-cyan-200 text-[11px]">ذكاء اصطناعي يحلل شخصيتك ويجد أفضل التوافقات</p>
                            </div>
                            
                            <div
                              className="ai-card ai-cut p-3 text-center"
                              style={{
                                ['--ai-b1' as any]: 'rgba(251,146,60,.55)',  // orange-400
                                ['--ai-b2' as any]: 'rgba(244,63,94,.55)',   // rose-500 accent
                                ['--ai-b3' as any]: 'rgba(234,88,12,.55)',   // orange-600
                                background: 'linear-gradient(135deg, rgba(234,88,12,0.18), rgba(251,191,36,0.14))'
                              }}
                            >
                              <motion.div className="ai-ink">
                                <motion.span
                                  className="ai-ink__blob ai-ink__blob--1"
                                  initial={{ x: -18, y: -18 }}
                                  animate={{ x: [-18, 8, -12], y: [-18, 6, -18] }}
                                  transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
                                  style={{ width: 100, height: 100, top: '10%', left: '10%' }}
                                />
                                <motion.span
                                  className="ai-ink__blob ai-ink__blob--3"
                                  initial={{ x: 22, y: 22 }}
                                  animate={{ x: [22, -12, 22], y: [22, -10, 22] }}
                                  transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                                  style={{ width: 95, height: 95, bottom: '12%', right: '12%' }}
                                />
                              </motion.div>
                              <div className="ai-icon ai-icon--ghost mx-auto mb-2">
                                <Target className="w-4 h-4 text-white" />
                              </div>
                              <h4 className="text-xs font-bold text-white mb-1">نتائج دقيقة</h4>
                              <p className="text-cyan-200 text-[11px]">احصل على تقييم دقيق لدرجة التوافق مع كل شخص</p>
                            </div>
                          </div>
                          
                          <div className="text-center mb-4">
                            <p className="text-cyan-200 text-xs max-w-2xl mx-auto">
                              نظام توافق شخصي متقدم حيث لا يُسمح للمشاركين بالكشف عن أسمائهم وأعمارهم إلا في حالة التطابق المتبادل في النهاية
                            </p>
                          </div>
                          
                          <div className="space-y-6 sm:space-y-8">
                          {/* Step 1 */}
                          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                            <div className="flex-shrink-0">
                              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-full flex items-center justify-center">
                                <span className="text-white font-bold text-lg sm:text-xl">1</span>
                              </div>
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">املأ استبيان التوافق</h3>
                              <p className="text-cyan-200 text-sm sm:text-base mb-3">
                                أجب على أسئلة شخصية مدروسة لتحليل شخصيتك وتفضيلاتك بدقة
                              </p>
                            </div>
                            <div className="hidden sm:block flex-shrink-0">
                              <ChevronLeft className="w-6 h-6 text-cyan-400 transform rotate-180" />
                            </div>
                          </div>

                          {/* Step 2 */}
                          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                            <div className="flex-shrink-0">
                              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                                <span className="text-white font-bold text-lg sm:text-xl">2</span>
                              </div>
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">تحليل ذكي للتوافق</h3>
                              <p className="text-cyan-200 text-sm sm:text-base mb-3">
                                الذكاء الاصطناعي يحلل جميع المشاركين ويجد أكثر الأشخاص توافقاً معك
                              </p>
                            </div>
                            <div className="hidden sm:block flex-shrink-0">
                              <ChevronLeft className="w-6 h-6 text-cyan-400 transform rotate-180" />
                            </div>
                          </div>

                          {/* Step 3 */}
                          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                            <div className="flex-shrink-0">
                              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
                                <span className="text-white font-bold text-lg sm:text-xl">3</span>
                              </div>
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">تواصل عبر واتساب</h3>
                              <p className="text-cyan-200 text-sm sm:text-base mb-3">
                                سيتم التواصل معك عبر واتساب للدفع وتأكيد حضورك للفعالية
                              </p>
                            </div>
                            <div className="hidden sm:block flex-shrink-0">
                              <ChevronLeft className="w-6 h-6 text-cyan-400 transform rotate-180" />
                            </div>
                          </div>

                          {/* Step 4 */}
                          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                            <div className="flex-shrink-0">
                              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center">
                                <span className="text-white font-bold text-lg sm:text-xl">4</span>
                              </div>
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">لقاء وقرار التطابق</h3>
                              <p className="text-cyan-200 text-sm sm:text-base mb-3">
                                تلتقي بالشخص وتقرر إذا كنت تريد التطابق ومشاركة معلوماتك الشخصية أم لا - كل شيء يحدث بسلاسة على الموقع
                              </p>
                            </div>
                          </div>
                          
                          {/* Privacy Notice - AI styled */}
                          <div className="mt-4 p-3 ai-card ai-cut">
                            <motion.div className="ai-ink">
                              <motion.span
                                className="ai-ink__blob ai-ink__blob--2"
                                initial={{ x: -20, y: -10 }}
                                animate={{ x: [-20, 10, -12], y: [-10, 6, -10] }}
                                transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
                                style={{ width: 120, height: 120, top: '10%', left: '10%' }}
                              />
                            </motion.div>
                            <div className="flex items-start gap-3">
                              <Shield className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <h4 className="text-white font-semibold mb-1 text-sm">حماية الخصوصية</h4>
                                <p className="text-cyan-200 text-xs">
                                  معلوماتك الشخصية محمية تماماً ولن تُشارك إلا في حالة التطابق المتبادل بين الطرفين
                                </p>
                              </div>
                            </div>
                          </div>
                          </div>
                        </div>
                      </div>
                  </details>
                  </div>
                

                {/* Registration Options - Hidden for new users, only show for users who dismiss popup */}
                {false && !(resultToken || returningPlayerToken || localStorage.getItem('blindmatch_result_token') || localStorage.getItem('blindmatch_returning_token')) && (
                  <div id="start-journey" className="max-w-4xl mx-auto px-4 animate-in slide-in-from-bottom-4 duration-1000 delay-800">
                    <div className="text-center mb-6">
                      <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">انضم إلى الرحلة</h2>
                      <p className="text-cyan-200 text-sm">اختر الطريقة المناسبة للانضمام</p>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    
                    {/* Previous Participant Card */}
                    <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/30 rounded-xl p-4 sm:p-6 text-center hover:from-green-500/30 hover:to-emerald-500/30 transition-all duration-300">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center mx-auto mb-3">
                        <UserCheck className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-white mb-2">مشارك سابق</h3>
                      
                      <p className="text-cyan-200 text-xs sm:text-sm mb-3">سجل للفعالية القادمة باستخدام حسابك الحالي</p>
                      
                      <button
                        onClick={handleAutoSignupNextEvent}
                        disabled={nextEventSignupLoading || showNextEventSignup}
                        className={`w-full border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform text-sm py-3 rounded-lg ${
                          showNextEventSignup 
                            ? "bg-gray-400 cursor-not-allowed opacity-60" 
                            : "bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 hover:scale-105"
                        } text-white`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          {nextEventSignupLoading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              <span>جاري التسجيل...</span>
                            </>
                          ) : showNextEventSignup ? (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              <span>مسجل بالفعل ✓</span>
                            </>
                          ) : (
                            <>
                              <span>سجل في الفعالية القادمة</span>
                              <ChevronLeft className="w-4 h-4 transform rotate-180" />
                            </>
                          )}
                        </div>
                      </button>
                    </div>

                    {/* New Player Card */}
                    {!resultToken && !returningPlayerToken && (
                      <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 rounded-xl p-4 sm:p-6 text-center hover:from-cyan-500/30 hover:to-blue-500/30 transition-all duration-300" data-section="new-user">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center mx-auto mb-3">
                          <UserPlus className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-white mb-2">مشترك جديد</h3>
                        <p className="text-cyan-200 text-xs sm:text-sm mb-3">احصل على رقم مخصص وابدأ رحلة التوافق</p>
                          <Button
                            onClick={async () => {
                              setLoading(true)
                              try {
                                const res = await fetch("/api/participant", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "create-token" }),
                                })
                                const data = await res.json()
                                console.log("Token creation response:", data)
                                
                                if (res.status === 403) {
                                  // Registration is closed
                                  toast.error(data.message || "التسجيل مغلق حالياً")
                                  return
                                }
                                
                                if (res.ok && data.secure_token) {
                                  setAssignedNumber(data.assigned_number)
                                  // Mark just-created to show modal after redirect
                                  sessionStorage.setItem('justCreatedToken', '1')
                                  sessionStorage.setItem('justCreatedTokenValue', data.secure_token)
                                  saveUserToken(data.secure_token); // Save token to localStorage for auto-fill
                                  console.log("Redirecting to:", `/welcome?token=${data.secure_token}`)
                                  // Try multiple redirect methods to ensure it works
                                  try {
                                    window.location.href = `/welcome?token=${data.secure_token}`
                                  } catch (redirectError) {
                                    console.error("Redirect failed, trying alternative:", redirectError)
                                    window.location.replace(`/welcome?token=${data.secure_token}`)
                                  }
                                } else {
                                  console.error("Token creation failed:", data)
                                  toast.error("فشل في الحصول على رقم: " + (data.error || "خطأ غير معروف"))
                                }
                              } catch (err) {
                                console.error("Error creating token:", err)
                                // alert("❌ فشل في الحصول على رقم")
                              } finally {
                                setLoading(false)
                              }
                            }}
                            disabled={loading || phase === "round_1"}
                            className={`w-full spring-btn border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform text-base sm:text-lg py-3 sm:py-4 ${
                              phase === "round_1" 
                                ? "bg-gray-400 cursor-not-allowed opacity-60" 
                                : "bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-700 hover:to-blue-800 hover:scale-105"
                            } text-white`}
                          >
                            {loading ? (
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                جاري التخصيص...
                              </div>
                            ) : phase === "round_1" ? (
                              "الجولة الفردية نشطة حالياً"
                            ) : (
                              "ابدأ رحلتك!"
                            )}
                          </Button>
                      </div>
                    )}

                  </div>
                  </div>
                )}

                {/* Navbar for Saved Data Users */}
                {(resultToken || returningPlayerToken || localStorage.getItem('blindmatch_result_token') || localStorage.getItem('blindmatch_returning_token')) && (
                  <div className="max-w-4xl mx-auto px-4 mt-1 animate-in slide-in-from-bottom-4 duration-1000 delay-1000">
                    <div className="p-3 sm:p-4 circuit-card rounded-2xl">
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 auto-rows-auto items-start gap-3 sm:gap-4">
                        {/* Next Event Signup Card - Full Width Row 1 */}
                        <div className={`col-span-2 ai-card ai-animated-border rounded-2xl ${showNextEventSignup ? "ai-card--success" : "ai-card--danger"} p-3 sm:p-5 text-center group ${
                          showNextEventSignup 
                            ? "opacity-90" 
                            : "hover:shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-[1px] cursor-pointer"
                        }`}
                        style={{
                          ['--ab-c1' as any]: showNextEventSignup ? '#34d399' : '#f87171',
                          ['--ab-c2' as any]: showNextEventSignup ? '#10b981' : '#fb923c',
                          ['--ab-c3' as any]: showNextEventSignup ? '#059669' : '#ef4444',
                          ['--cp' as any]: showNextEventSignup ? 'rgba(16,185,129,0.16)' : 'rgba(239,68,68,0.16)'
                        }}
                        onClick={!showNextEventSignup ? handleAutoSignupNextEvent : undefined}
                        >
                          <UserCheck className={`w-6 h-6 text-white mx-auto mb-2 ${showNextEventSignup ? "opacity-60" : ""}`} />
                          <h4 className="text-base font-bold text-white mb-2">
                            {showNextEventSignup ? "مسجل للفعالية القادمة ✓" : "سجل للفعالية القادمة"}
                          </h4>
                          <p className="text-slate-300 text-xs mb-2">
                            {showNextEventSignup ? "أنت مسجل بالفعل في الفعالية القادمة" : "سجل باستخدام حسابك الحالي"}
                          </p>
                          
                          {!showNextEventSignup ? (
                            <div className="flex items-center justify-center gap-2 text-emerald-300">
                              <span className="text-xs font-medium">انقر للتسجيل</span>
                              <ChevronLeft className="w-4 h-4 transform rotate-180 group-hover:translate-x-1 transition-transform" />
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2 mt-3">
                              {/* Unregister from Next Event Button */}
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const confirmed = window.confirm(
                                    "هل أنت متأكد من إلغاء تسجيلك في الفعالية القادمة؟\n\nيمكنك التسجيل مرة أخرى لاحقاً."
                                  );
                                  if (!confirmed) return;
                                  
                                  setNextEventSignupLoading(true);
                                  try {
                                    const token = resultToken || returningPlayerToken;
                                    const response = await fetch("/api/participant", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ 
                                        action: "unregister-next-event",
                                        secure_token: token
                                      }),
                                    });
                                    
                                    const data = await response.json();
                                    if (response.ok) {
                                      setShowNextEventSignup(false);
                                      toast.success("تم إلغاء تسجيلك في الفعالية القادمة بنجاح");
                                    } else {
                                      toast.error(`فشل إلغاء التسجيل: ${data.error}`);
                                    }
                                  } catch (error) {
                                    toast.error(`خطأ في الشبكة: ${error}`);
                                  }
                                  setNextEventSignupLoading(false);
                                }}
                                disabled={nextEventSignupLoading}
                                className="px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/30 text-orange-300 rounded-lg text-xs font-medium transition-all duration-300 hover:scale-105"
                              >
                                {nextEventSignupLoading ? "جاري الإلغاء..." : "إلغاء التسجيل"}
                              </button>
                              
                              {/* Disable Auto-Signup Button (if enabled) */}
                              {autoSignupEnabled && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const confirmed = window.confirm(
                                      "هل أنت متأكد من إيقاف التسجيل التلقائي للفعاليات القادمة؟\n\nسيتم إيقاف التسجيل التلقائي فقط (ستبقى مسجلاً للفعالية القادمة)."
                                    );
                                    if (!confirmed) return;
                                    
                                    setNextEventSignupLoading(true);
                                    try {
                                      const token = resultToken || returningPlayerToken;
                                      const response = await fetch("/api/participant", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ 
                                          action: "disable-auto-signup",
                                          secure_token: token
                                        }),
                                      });
                                      
                                      const data = await response.json();
                                      if (response.ok) {
                                        setAutoSignupEnabled(false);
                                        toast.success("تم إيقاف التسجيل التلقائي بنجاح");
                                      } else {
                                        toast.error(`فشل إيقاف التسجيل: ${data.error}`);
                                      }
                                    } catch (error) {
                                      toast.error(`خطأ في الشبكة: ${error}`);
                                    }
                                    setNextEventSignupLoading(false);
                                  }}
                                  disabled={nextEventSignupLoading}
                                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-300 rounded-lg text-xs font-medium transition-all duration-300 hover:scale-105"
                                >
                                  إيقاف التسجيل التلقائي
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Returning Player Button - Row 2 Left */}
                        <button
                          onClick={() => {
                            const token = returningPlayerToken || resultToken || localStorage.getItem('blindmatch_returning_token') || localStorage.getItem('blindmatch_result_token');
                            if (token) {
                              handleTokenNavigation(token);
                            }
                          }}
                          className="block w-full h-full group ai-card ai-animated-border ai-card--accent rounded-2xl p-3 sm:p-5 text-center hover:shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-[1px]"
                          style={{
                            ['--ab-c1' as any]: '#a855f7',
                            ['--ab-c2' as any]: '#ec4899',
                            ['--ab-c3' as any]: '#9333ea',
                            ['--cp' as any]: 'rgba(168,85,247,0.16)'
                          }}
                          id="returning-player"
                        >
                          
                          <RotateCcw className="w-6 h-6 text-white mx-auto mb-2" />
                          <h4 className="text-base font-bold text-white mb-2">مشترك عائد</h4>
                          <p className="text-slate-300 text-xs mb-2">
                            العودة إلى رحلتك او تعديل بياناتك
                          </p>
                        </button>

                        {/* Results Button - Row 2 Right */}
                        <button
                          onClick={() => {
                            const token = resultToken || returningPlayerToken || localStorage.getItem('blindmatch_result_token') || localStorage.getItem('blindmatch_returning_token');
                            if (token) {
                              window.location.href = `/results?token=${token}`;
                            }
                          }}
                          className="block w-full h-full group ai-card ai-animated-border ai-card--accent rounded-2xl p-3 sm:p-5 text-center hover:shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-[1px]"
                          style={{
                            ['--ab-c1' as any]: '#fb923c',
                            ['--ab-c2' as any]: '#f43f5e',
                            ['--ab-c3' as any]: '#ea580c',
                            ['--cp' as any]: 'rgba(251,146,60,0.16)'
                          }}
                        >
                          
                          <Search className="w-6 h-6 text-white mx-auto mb-2" />
                          <h4 className="text-base font-bold text-white mb-2">عرض نتائج التوافق</h4>
                          <p className="text-slate-300 text-xs mb-2">
                            اعرض جميع نتائج التوافق الخاصة بك
                          </p>
                        </button>

                        {/* Groups Button - Full Width Row 3 */}
                        <button
                          onClick={() => window.location.href = '/groups'}
                          className="col-span-2 group ai-card ai-animated-border ai-card--accent rounded-2xl p-2 sm:p-3 !min-h-0 !h-auto text-center hover:shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-[1px]"
                          style={{
                            ['--ab-c1' as any]: '#38bdf8',
                            ['--ab-c2' as any]: '#6366f1',
                            ['--ab-c3' as any]: '#3b82f6',
                            ['--cp' as any]: 'rgba(99,102,241,0.16)'
                          }}
                        >
                          
                          <Users className="w-6 h-6 text-white mx-auto mb-2" />
                          <h4 className="text-base font-bold text-white mb-2">جولة القروبات</h4>
                        </button>
                      </div>
                      
                      {/* Saved data info intentionally removed per design request */}
                    </div>
                  </div>
                )}

                </div>

                {/* Token Input Sections for Non-Saved Users */}
                {!(resultToken || returningPlayerToken || localStorage.getItem('blindmatch_result_token') || localStorage.getItem('blindmatch_returning_token')) && (
                  <>
                    {/* See Match Results Section */}
                    <div className="max-w-2xl mx-auto px-4 mt-2 animate-in slide-in-from-bottom-4 duration-1000 delay-1000">
                      <div className="bg-white/15 backdrop-blur-2xl border border-white/30 rounded-xl sm:rounded-2xl p-6 sm:p-8 shadow-xl ring-1 ring-white/10">
                        <div className="text-center">
                          <div className="flex justify-center mb-4">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center">
                              <Search className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                            </div>
                          </div>
                          
                          <h3 className="text-lg sm:text-xl font-bold text-white mb-2">عرض نتائج التوافق</h3>
                          <p className="text-cyan-200 text-xs sm:text-sm mb-4">
                            أدخل الرمز المميز الخاص بك لعرض جميع نتائج التوافق
                          </p>
                          {(() => {
                            const securityStatus = getSecurityStatus('resultToken');
                            return securityStatus.message && (
                              <div className={`text-xs p-2 rounded-lg mb-3 ${
                                securityStatus.warningLevel === 'error' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                                securityStatus.warningLevel === 'warning' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
                                'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              }`}>
                                {securityStatus.message}
                              </div>
                            );
                          })()}
                          
                          <div className="space-y-3 sm:space-y-4">
                            <div
                        className={`relative p-6 rounded-xl ai-animated-border ${
                          dark ? 'bg-slate-900/60' : 'bg-white/90'
                        } shadow-lg backdrop-blur-sm ${
                          questionTransition === 'next' ? 'animate-slide-in-right' :
                          questionTransition === 'prev' ? 'animate-slide-in-left' : ''
                        }`}
                        style={{
                          ['--ab-size' as any]: '2px',
                          ['--ab-speed' as any]: '9s',
                          ['--ab-c1' as any]:
                            currentQuestions[currentQuestionIndex].level === 0
                              ? '#34d399'
                              : currentQuestions[currentQuestionIndex].level === 1
                                ? '#22d3ee'
                                : currentQuestions[currentQuestionIndex].level === 2
                                  ? '#f59e0b'
                                  : currentQuestions[currentQuestionIndex].level === 3
                                    ? '#a855f7'
                                    : '#10b981',
                          ['--ab-c2' as any]:
                            currentQuestions[currentQuestionIndex].level === 0
                              ? '#10b981'
                              : currentQuestions[currentQuestionIndex].level === 1
                                ? '#3b82f6'
                                : currentQuestions[currentQuestionIndex].level === 2
                                  ? '#f97316'
                                  : currentQuestions[currentQuestionIndex].level === 3
                                    ? '#ec4899'
                                    : '#14b8a6',
                          ['--ab-c3' as any]:
                            currentQuestions[currentQuestionIndex].level === 0
                              ? '#14b8a6'
                              : currentQuestions[currentQuestionIndex].level === 1
                                ? '#60a5fa'
                                : currentQuestions[currentQuestionIndex].level === 2
                                  ? '#fb923c'
                                  : currentQuestions[currentQuestionIndex].level === 3
                                    ? '#f472b6'
                                    : '#34d399',
                        }}>
                              <input
                                type="text"
                                placeholder="أدخل الرمز المميز للنتائج..."
                                value={resultToken}
                                onChange={(e) => setResultToken(e.target.value)}
                                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white/15 border border-white/30 ring-1 ring-white/10 rounded-lg sm:rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-orange-400/50 focus:border-orange-400 transition-all duration-300 text-sm sm:text-base"
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    viewResults(resultToken);
                                  }
                                }}
                              />
                            </div>
                            <Button
                              onClick={() => viewResults(resultToken)}
                              disabled={!resultToken.trim() || getSecurityStatus('resultToken').isLocked}
                              className="w-full spring-btn bg-gradient-to-r from-orange-600 to-red-700 hover:from-orange-700 hover:to-red-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105 text-base sm:text-lg py-3 sm:py-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                            >
                              عرض النتائج
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Group Activities Section */}
                    <div className="max-w-2xl mx-auto px-4 mt-6 animate-in slide-in-from-bottom-4 duration-1000 delay-1200">
                      <div className="bg-white/15 backdrop-blur-2xl border border-white/30 rounded-xl sm:rounded-2xl p-6 sm:p-8 shadow-xl ring-1 ring-white/10">
                        <div className="text-center">
                          <div className="flex justify-center mb-4">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                              <Users className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                            </div>
                          </div>
                          
                          <h3 className="text-lg sm:text-xl font-bold text-white mb-2">ألعاب جماعية</h3>
                          <p className="text-cyan-200 text-xs sm:text-sm mb-4">
                            30 دقيقة من الألعاب التفاعلية الممتعة للمجموعات
                          </p>
                          
                          <div className="space-y-3 sm:space-y-4">
                            <div className="grid grid-cols-3 gap-2 text-xs text-cyan-200">
                              <div className="flex items-center justify-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                <span>أسئلة للنقاش</span>
                              </div>
                              <div className="flex items-center justify-center gap-1">
                                <Target className="w-3 h-3" />
                                <span>لم أفعل من قبل</span>
                              </div>
                              <div className="flex items-center justify-center gap-1">
                                <Handshake className="w-3 h-3" />
                                <span>ماذا تفضل</span>
                              </div>
                            </div>
                            <Button
                              onClick={() => window.location.href = '/groups'}
                              className="w-full spring-btn bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105 text-base sm:text-lg py-3 sm:py-4"
                            >
                              <Users className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                              ابدأ الألعاب الجماعية
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                

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
      </>
    );
  }

  if (phase === null) {
    return (
      <>
        <NavigationBar />
        <LogoHeader />
        <BottomLeftContactButton />
        <ParticipantIcon />
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Token Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`w-full max-w-md mx-4 rounded-2xl border p-5 shadow-2xl ${dark ? "bg-slate-800/95 border-slate-700" : "bg-white/95 border-gray-200"}`} dir="rtl">
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
      <AnimatePresence>
        {showSurveySuccessModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={`${dark ? "bg-slate-800/95 border-slate-700" : "bg-white/95 border-gray-200"} w-full max-w-md mx-4 rounded-2xl border p-5 shadow-2xl`}
              dir="rtl"
              initial={{ y: 20, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 12, scale: 0.98, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.6 }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`rounded-lg p-2 ${dark ? 'bg-emerald-500/10 border border-emerald-400/20' : 'bg-green-50 border border-green-200'}`}>
                    <CheckCircle className={dark ? 'text-emerald-300' : 'text-green-600'} size={18} />
                  </div>
                  <h3 className={`text-lg font-extrabold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent`}>
                    تم إرسال الاستبيان بنجاح
                  </h3>
                </div>
                <button onClick={() => setShowSurveySuccessModal(false)} className={`${dark ? "hover:bg-slate-700" : "hover:bg-gray-100"} rounded-full p-1`} aria-label="إغلاق">✕</button>
              </div>
              <div className={`${dark ? "bg-emerald-500/10 border border-emerald-400/20" : "bg-green-50 border border-green-200"} rounded-xl p-3 mb-3`}> 
                <p className={`${dark ? "text-emerald-200" : "text-green-700"} text-sm`}>شكراً لمشاركتك! تم حفظ إجاباتك بنجاح 🎉</p>
              </div>
              <div className={`${dark ? "bg-slate-900/40 border border-slate-600" : "bg-gray-50 border border-gray-300"} rounded-xl p-3 mb-3`}>
                <p className={`${dark ? "text-slate-300" : "text-gray-700"} text-xs mb-1`}>رمزك الآمن</p>
                <p className={`${dark ? "text-slate-200" : "text-gray-800"} text-sm mb-1`}>رقمك: <span className="font-semibold">#{assignedNumber ?? '—'}</span></p>
                <div className={`${dark ? "border-slate-600 bg-slate-900/40" : "border-gray-300 bg-gray-50"} flex items-center gap-2 rounded-xl border px-3 py-2 mt-2`}> 
                  <div className={`${dark ? "text-cyan-300" : "text-blue-700"} font-mono text-xs sm:text-sm select-all overflow-x-auto whitespace-nowrap`}>{secureToken}</div>
                  <Button
                    onClick={async () => {
                      if (secureToken) {
                        try { await navigator.clipboard.writeText(secureToken); toast.success('تم النسخ'); } catch (_) {}
                      }
                    }}
                    className="h-8 px-3 text-xs"
                  >نسخ</Button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setShowSurveySuccessModal(false)} className="h-9 px-4 text-sm w-full sm:w-auto">حسناً</Button>
                <Button onClick={() => { if (secureToken) { setShowSurveySuccessModal(false); window.location.href = `/welcome?token=${secureToken}` } }} className="h-9 px-4 text-sm w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white">الانتقال للصفحة الرئيسية</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-400 mx-auto"></div>
          <p className="text-slate-300 text-xl font-medium" dir="rtl">جارٍ التحميل...</p>
        </div>
      </div>
      </>
    )
  }
  
    if (!isResolving && (phase === "group_phase" || phase === "round_1" || phase === "round_2" || /* phase === "round_3" || phase === "round_4" || phase === "group_phase" || */ false) && step === 0) {
  return (
      <>
        <NavigationBar />
        <LogoHeader />
        <BottomLeftContactButton />
        <ParticipantIcon />
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center space-y-4 max-w-md mx-auto p-8">
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 backdrop-blur-sm">
            <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="font-bold text-2xl text-red-200 mb-2">التسجيل مغلق</h2>
            <p className="text-red-300 text-sm">المنظّم بدأ التوافق أو أغلق التسجيل.</p>
          </div>
        </div>
      </div>
      </>
    )
  }

  // Emergency pause overlay
  if (emergencyPaused) {
    return (
      <>
        <NavigationBar />
        <LogoHeader />
        <BottomLeftContactButton />
        <ParticipantIcon />
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
    </>
  )
}
  
  return (<>
      {/* Unified Navigation Bar - Hide in step 4 (round mode) as it's included in page content */}
      {step !== 4 && <NavigationBar />}
      {/* Clickable Logo Header - Hide in step 4 (round mode) as it's included in page content */}
      {step !== 4 && <LogoHeader />}
      {/* Bottom Left Contact Button - Hide in step 4 (round mode) as it's included in page content */}
      {step !== 4 && <BottomLeftContactButton />}
      {/* Participant Icon - Hide in step 4 (round mode) as it's included in page content */}
      {step !== 4 && <ParticipantIcon />}
      
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`${dark ? "bg-slate-800/95 border-slate-700" : "bg-white/95 border-gray-200"} w-full max-w-md mx-4 rounded-2xl border p-5 shadow-2xl`} dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h3 className={`${dark ? "text-slate-100" : "text-gray-800"} text-lg font-bold`}>تم إنشاء حسابك بنجاح</h3>
              <button onClick={() => setShowTokenModal(false)} className={`${dark ? "hover:bg-slate-700" : "hover:bg-gray-100"} rounded-full p-1`}>✕</button>
            </div>
            <p className={`${dark ? "text-slate-300" : "text-gray-600"} text-sm mb-3`}>هذا رمز الوصول الخاص بك. احتفظ به أو انسخه للعودة لاحقاً إلى تاريخك.</p>
            <div className={`${dark ? "border-slate-600 bg-slate-900/40" : "border-gray-300 bg-gray-50"} flex items-center justify-between gap-2 rounded-xl border px-3 py-2 mb-3`}>
              <div className={`${dark ? "text-cyan-300" : "text-blue-700"} font-mono text-sm select-all`}>{secureToken}</div>
              <Button onClick={() => { if (secureToken) navigator.clipboard.writeText(secureToken) }} className="h-8 px-3 text-xs">نسخ</Button>
            </div>
            <div className={`${dark ? "bg-cyan-500/10 border border-cyan-400/20" : "bg-blue-50 border border-blue-200"} rounded-xl p-3 mb-4`}>
              <p className={`${dark ? "text-cyan-200" : "text-blue-700"} text-xs`}>نصيحة: قم بحفظ هذه الصفحة في المفضلة حتى تعود بسهولة إلى رحلتك وتاريخك لاحقاً.</p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTokenModal(false)} className="h-8 px-3 text-xs">حسناً</Button>
              <Button onClick={() => { if (secureToken) { setShowTokenModal(false); window.history.replaceState(null, "", `/welcome?token=${secureToken}`) } }} className="h-8 px-3 text-xs">فتح الصفحة برمزك</Button>
            </div>
          </div>
        </div>
      )}
      <AnimatePresence>
        {showSurveySuccessModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={`${dark ? "bg-slate-800/95 border-slate-700" : "bg-white/95 border-gray-200"} w-full max-w-md mx-4 rounded-2xl border p-5 shadow-2xl`}
              dir="rtl"
              initial={{ y: 20, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 12, scale: 0.98, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.6 }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`rounded-lg p-2 ${dark ? 'bg-emerald-500/10 border border-emerald-400/20' : 'bg-green-50 border border-green-200'}`}>
                    <CheckCircle className={dark ? 'text-emerald-300' : 'text-green-600'} size={18} />
                  </div>
                  <h3 className={`text-lg font-extrabold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent`}>
                    تم إرسال الاستبيان بنجاح
                  </h3>
                </div>
                <button onClick={() => setShowSurveySuccessModal(false)} className={`${dark ? "hover:bg-slate-700" : "hover:bg-gray-100"} rounded-full p-1`} aria-label="إغلاق">✕</button>
              </div>
              <div className={`${dark ? "bg-emerald-500/10 border border-emerald-400/20" : "bg-green-50 border border-green-200"} rounded-xl p-3 mb-3`}> 
                <p className={`${dark ? "text-emerald-200" : "text-green-700"} text-sm`}>شكراً لمشاركتك! تم حفظ إجاباتك بنجاح 🎉</p>
              </div>
              <div className={`${dark ? "bg-slate-900/40 border border-slate-600" : "bg-gray-50 border border-gray-300"} rounded-xl p-3 mb-3`}>
                <p className={`${dark ? "text-slate-300" : "text-gray-700"} text-xs mb-1`}>رمزك الآمن</p>
                <p className={`${dark ? "text-slate-200" : "text-gray-800"} text-sm mb-1`}>رقمك: <span className="font-semibold">#{assignedNumber ?? '—'}</span></p>
                <div className={`${dark ? "border-slate-600 bg-slate-900/40" : "border-gray-300 bg-gray-50"} flex items-center gap-2 rounded-xl border px-3 py-2 mt-2`}> 
                  <div className={`${dark ? "text-cyan-300" : "text-blue-700"} font-mono text-xs sm:text-sm select-all overflow-x-auto whitespace-nowrap`}>{secureToken}</div>
                  <Button
                    onClick={async () => {
                      if (secureToken) {
                        try { await navigator.clipboard.writeText(secureToken); toast.success('تم النسخ'); } catch (_) {}
                      }
                    }}
                    className="h-8 px-3 text-xs"
                  >نسخ</Button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setShowSurveySuccessModal(false)} className="h-9 px-4 text-sm w-full sm:w-auto">حسناً</Button>
                <Button onClick={() => { if (secureToken) { setShowSurveySuccessModal(false); window.location.href = `/welcome?token=${secureToken}` } }} className="h-9 px-4 text-sm w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white">الانتقال للصفحة الرئيسية</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div
        className={`min-h-screen px-4 py-4 flex items-start justify-center relative overflow-hidden transition-colors duration-1000 ${
          dark
            ? step === 4 && currentRound === 1
              ? currentQuestions[currentQuestionIndex].level === 0
                ? "bg-gradient-to-br from-emerald-900/20 via-slate-800 to-green-900/20 text-white"
                : currentQuestions[currentQuestionIndex].level === 1
                  ? "bg-gradient-to-br from-cyan-900/20 via-slate-800 to-blue-900/20 text-white"
                  : currentQuestions[currentQuestionIndex].level === 2
                    ? "bg-gradient-to-br from-amber-900/20 via-slate-800 to-orange-900/20 text-white"
                    : currentQuestions[currentQuestionIndex].level === 3
                      ? "bg-gradient-to-br from-purple-900/20 via-slate-800 to-pink-900/20 text-white"
                      : "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white"
              : "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white"
            : step === 4 && currentRound === 1
              ? currentQuestions[currentQuestionIndex].level === 0
                ? "bg-gradient-to-br from-emerald-50 via-green-50 to-emerald-100 text-gray-900"
                : currentQuestions[currentQuestionIndex].level === 1
                  ? "bg-gradient-to-br from-cyan-50 via-blue-50 to-cyan-100 text-gray-900"
                  : currentQuestions[currentQuestionIndex].level === 2
                    ? "bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 text-gray-900"
                    : currentQuestions[currentQuestionIndex].level === 3
                      ? "bg-gradient-to-br from-purple-50 via-pink-50 to-purple-100 text-gray-900"
                      : "bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-900"
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


      <div className="w-full max-w-md space-y-10 text-center animate-fade-in relative z-10">

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
                  <ParticipantBadge size="large" />
                </div>
                
                <div className="text-center space-y-4">
                  <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight bg-clip-text text-transparent mb-4 ${
                    dark ? "bg-gradient-to-r from-cyan-300 to-blue-400" : "bg-gradient-to-r from-cyan-600 to-blue-700"
                  }`}>
                    نظام الصداقة الذكي
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
                  نظام الصداقة الذكي
                </h1>
                <p className={`text-sm sm:text-base leading-relaxed ${
                  dark ? "text-slate-300" : "text-gray-600"
                }`}>
                  ستبدأ بجلوس مع مجموعة لمدة 20-30 دقيقة، ثم تنتقل إلى لقاءات فردية مع أشخاص متوافقين. 
                  بعد كل حوار، قرر إذا كان
                  <span className={`font-semibold ${
                    dark ? "text-slate-200" : "text-gray-800"
                  }`}> شخص متوافق </span>
                  أو
                  <span className="font-semibold text-red-500"> غير متوافق معك</span>.
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
                      const res = await fetch("/api/participant", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "create-token" }),
                      })
                      const data = await res.json()
                      if (res.status === 403) {
                        // Registration is closed
                        toast.error(data.message || "التسجيل مغلق حالياً")
                        return
                      }
                      if (data.secure_token) {
                        setAssignedNumber(data.assigned_number)
                        sessionStorage.setItem('justCreatedToken', '1')
                        sessionStorage.setItem('justCreatedTokenValue', data.secure_token)
                        saveUserToken(data.secure_token); // Save token to localStorage for auto-fill
                        window.location.href = `/welcome?token=${data.secure_token}`
                      } else {
                        toast.error("فشل في الحصول على رقم")
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
              dark ? "bg-white/0 border-white/20 hover:bg-white/0" : "bg-white/80 border-gray-200/50 shadow-xl hover:bg-white/90"
            }`}>
              <div className="flex flex-col items-center gap-4 mb-6">
                <div className="relative">
                  <div className={`relative w-24 h-24 rounded-2xl border-2 shadow-2xl flex items-center justify-center transform transition-all duration-500 hover:scale-110 ${
                    dark 
                      ? "bg-white/0" 
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
                    onClick={async () => {
                      console.log("🔘 ابدأ الاستبيان button clicked")
                      
                      // First, try to load existing survey data if available
                      if (!hasSubstantialSurveyData(surveyData.answers)) {
                        try {
                          const tokenToUse = token || secureToken;
                          console.log("🔍 Start Survey - Using token:", tokenToUse);
                          const userRes = await fetch("/api/participant", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "resolve-token", secure_token: tokenToUse }),
                          });
                          const userData = await userRes.json();
                          console.log("🔍 Start Survey - userData received:", userData);
                          if (userData.success && userData.survey_data) {
                            console.log("🔍 Start Survey - survey_data exists:", userData.survey_data);
                            
                            // Set assigned number if available
                            if (userData.assigned_number && !assignedNumber) {
                              setAssignedNumber(userData.assigned_number);
                              console.log("🔍 Start Survey - Set assigned number:", userData.assigned_number);
                            }
                            
                            // Set participant name if available
                            if (userData.name && !participantName) {
                              setParticipantName(userData.name);
                              console.log("🔍 Start Survey - Set participant name:", userData.name);
                            }
                            
                            // Ensure the survey_data has the expected structure
                            const formattedSurveyData = {
                              answers: userData.survey_data.answers || {},
                              termsAccepted: userData.survey_data.termsAccepted || false,
                              dataConsent: userData.survey_data.dataConsent || false,
                              ...userData.survey_data
                            };
                            setSurveyData(formattedSurveyData);
                          }
                        } catch (err) {
                          console.error("Failed to load existing survey data:", err);
                        }
                      }
                      
                      setShowSurvey(true)
                      // Delay setting editing flag to allow data to load first
                      setTimeout(() => {
                        console.log("🔍 Start Survey - Current surveyData before editing:", surveyData);
                        setIsEditingSurvey(true);
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
                  <Suspense fallback={
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                        <p className={`text-lg ${dark ? 'text-slate-200' : 'text-gray-800'}`}>جاري تحميل الاستبيان...</p>
                      </div>
                    </div>
                  }>
                    <SurveyComponent
                      onSubmit={handleSurveySubmit}
                      surveyData={surveyData}
                      setSurveyData={setSurveyData}
                      setIsEditingSurvey={setIsEditingSurvey}
                      loading={loading}
                      assignedNumber={assignedNumber || undefined}
                      secureToken={secureToken || undefined}
                    />
                  </Suspense>
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
              {/* History Icon - Left corner - TEMPORARILY COMMENTED OUT */}
              {false && historyMatches.length > 0 && (
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
                <ParticipantBadge size="small" />
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
                  dark ? "border-slate-400/30 bg-white/10" : "border-gray-400/30 bg-black/20"
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
                  <div className="flex flex-col gap-1">
                    <div className="font-bold">سنتواصل معك عبر واتساب فور إيجاد شريك متوافق!</div>
                    <div className="text-sm opacity-90">⚠️ يُرجى عدم الحضور للفعالية إلا بعد استلام رسالة التأكيد</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Users wait for host to move them to next phase */}
          </section>
        )}

        {/* Round 1 Guide Popup */}
        {showRound1Guide && (
          <div 
            className="fixed z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh' }}
          >
            <div className={`relative max-w-md w-full rounded-2xl border shadow-2xl animate-in zoom-in-95 duration-300 ${
              dark ? "bg-slate-800/95 border-slate-600" : "bg-white/95 border-gray-200"
            }`}>
              {/* Close button */}
              <button
                onClick={() => setShowRound1Guide(false)}
                className={`absolute -top-3 -right-3 w-8 h-8 rounded-full border-2 shadow-lg transition-all hover:scale-110 ${
                  dark 
                    ? "bg-slate-700 border-slate-500 hover:bg-slate-600" 
                    : "bg-white border-gray-300 hover:bg-gray-50"
                }`}
              >
                <X className={`w-5 h-5 mx-auto ${dark ? "text-slate-300" : "text-gray-600"}`} />
              </button>

              <div className="p-6 space-y-4">
                {/* Header with icon */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <h3 className={`text-xl font-bold ${dark ? "text-slate-100" : "text-gray-800"}`}>
                    مرحباً بك في الجولة الفردية
                  </h3>
                </div>

                {/* Instructions */}
                <div className={`space-y-3 text-sm ${dark ? "text-slate-300" : "text-gray-600"}`}>
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-cyan-400 font-bold">1</span>
                    </div>
                    <p>اذهب إلى <span className="font-semibold text-cyan-400">الطاولة المحددة</span> والتقي بشريكك</p>
                  </div>

                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-blue-400 font-bold">2</span>
                    </div>
                    <p>استخدم <span className="font-semibold text-blue-400">الأسئلة المعروضة</span> لبدء محادثة ممتعة</p>
                  </div>

                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-purple-400 font-bold">3</span>
                    </div>
                    <p>اضغط <span className="font-semibold text-purple-400">"ابدأ الحوار"</span> عندما تكونان جاهزين</p>
                  </div>

                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-green-400 font-bold">4</span>
                    </div>
                    <p>لديكم <span className="font-semibold text-green-400">30 دقيقة</span> للتعرف على بعضكم البعض</p>
                  </div>
                </div>

                {/* Tip box */}
                <div className={`p-3 rounded-xl border ${
                  dark 
                    ? "bg-amber-500/10 border-amber-400/30" 
                    : "bg-amber-50 border-amber-200"
                }`}>
                  <div className="flex items-start gap-2">
                    <Zap className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                      dark ? "text-amber-400" : "text-amber-600"
                    }`} />
                    <p className={`text-xs ${dark ? "text-amber-200" : "text-amber-800"}`}>
                      <span className="font-semibold">نصيحة:</span> كن صادقاً وطبيعياً، الأسئلة مصممة لمساعدتكم على التواصل بعمق
                    </p>
                  </div>
                </div>

                {/* Action button */}
                <button
                  onClick={() => setShowRound1Guide(false)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-700 hover:to-blue-800 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
                >
                  فهمت، لنبدأ
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
            {/* In-page navbar for round mode */}
            <div className="relative mb-12">
              <NavigationBar />
              <LogoHeader />
              <ParticipantIcon />
              <BottomLeftContactButton />
            </div>
            
            {/* Reverse Compatibility Mode Tag (disabled) */}
            {false && (
              <div className="flex justify-center -mt-6 mb-2">
                <span
                  className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold border shadow-lg tracking-wide ${
                    dark
                      ? 'bg-gradient-to-r from-purple-600/30 via-pink-600/30 to-rose-600/30 text-pink-100 border-pink-400/40 shadow-pink-500/20'
                      : 'bg-gradient-to-r from-purple-100 via-pink-100 to-rose-100 text-pink-700 border-pink-300 shadow-pink-300/30'
                  }`}
                  title="وضع التوافق العكسي"
                  aria-label="وضع التوافق العكسي"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>التوافق العكسي</span>
                </span>
              </div>
            )}
            
            <div ref={roundWrapperRef} className={`relative isolate overflow-hidden backdrop-blur-xl border rounded-2xl p-8 shadow-2xl round-bg-pattern ${
              dark ? "bg-transparent border-white/20" : "bg-transparent border-gray-300/30"
            }`}>
              {/* Local floating orbs background (clipped to container) */}
              <div className="pointer-events-none absolute inset-0 z-0">
                {/* Top-left cyan orb */}
                <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-cyan-500/20 blur-2xl" />
                {/* Center soft emerald glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl" />
                {/* Bottom-right purple orb */}
                <div className="absolute -bottom-14 -right-12 w-56 h-56 rounded-full bg-purple-500/20 blur-3xl" />

                {/* Floating particles (like page background) */}
                {[...Array(8)].map((_, i) => (
                  <div
                    key={`local-orb-${i}`}
                    className={`absolute rounded-full blur-xl opacity-30 md:opacity-25 animate-pulse ${
                      i % 2 === 0 ? 'bg-cyan-400' : 'bg-blue-500'
                    }`}
                    style={{
                      width: `${24 + (i % 3) * 16}px`,
                      height: `${24 + (i % 4) * 14}px`,
                      top: `${8 + (i * 11) % 76}%`,
                      left: `${6 + (i * 17) % 82}%`,
                      animationDelay: `${i * 0.6}s`,
                    }}
                  />
                ))}

                {/* Grid pattern overlay (match page background particles) */}
                <div
                  className="absolute inset-0 opacity-15"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%236B7280' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                  }}
                />
              </div>
              {/* Overlay rectangles that block background under foreground cards (Option D) */}
              <div className="pointer-events-none absolute inset-0 z-[5]">
                {overlayRects.map((r, idx) => (
                  <div
                    key={idx}
                    className={`absolute ${dark ? 'bg-slate-950' : 'bg-white'}`}
                    style={{
                      top: r.top,
                      left: r.left,
                      width: r.width,
                      height: r.height,
                      borderRadius: r.radius,
                    }}
                  />
                ))}
              </div>
              <div className="relative z-10">
              {/* History Icon - Left corner - TEMPORARILY COMMENTED OUT */}
              {false && historyMatches.length > 0 && (
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
              </div>
              
              {!conversationStarted ? (
                <>
                  {/* Partner Timer Notifications */}
                  {showPartnerStartedNotification && (
                    <div className={`relative z-10 mb-4 p-3 rounded-xl border-2 animate-in slide-in-from-top-4 duration-500 ${
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
                    <div className={`relative z-10 mb-4 p-3 rounded-xl border-2 animate-in slide-in-from-top-4 duration-500 ${
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
                  
                  {/* Match Info Card - Compact */}
                  <div ref={matchCardRef} className={`relative z-10 mb-6 p-4 rounded-xl border shadow-md ${
                    dark 
                      ? "bg-slate-800/50 border-slate-600/50"
                      : "bg-white/80 border-gray-200"
                  }`}>
                    {currentRound === 1 && round1AccessorySrc && (
                      <img
                        src={round1AccessorySrc}
                        alt=""
                        aria-hidden="true"
                        className="pointer-events-none select-none absolute -top-6 -left-4 w-16 md:w-20 h-auto drop-shadow-xl opacity-95"
                        style={{ transform: round1AccessorySrc === '/PinkRibbon.png' ? 'rotate(-12deg)' : 'rotate(8deg)' }}
                      />
                    )}
                    {(currentRound === 1 || currentRound === 2) && (
                      <div className="flex justify-center mb-3">
                        <span
                          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border shadow-sm tracking-wide ${
                            currentRound === 1
                              ? dark
                                ? "bg-gradient-to-r from-cyan-600/25 to-emerald-600/20 text-cyan-100 border-cyan-400/30"
                                : "bg-gradient-to-r from-cyan-100 to-emerald-100 text-cyan-800 border-cyan-200"
                              : dark
                                ? "bg-gradient-to-r from-pink-600/25 to-purple-600/20 text-pink-100 border-pink-400/30"
                                : "bg-gradient-to-r from-pink-100 to-purple-100 text-pink-800 border-pink-200"
                          }`}
                          aria-label={currentRound === 1 ? "مطابقة نفس الجنس" : "مطابقة الجنس الآخر"}
                          title={currentRound === 1 ? "Same-gender match" : "Opposite-gender match"}
                        >
                          <span className={`w-2 h-2 rounded-full ${currentRound === 1 ? "bg-cyan-400" : "bg-pink-400"}`} />
                          <span>{currentRound === 1 ? "نفس الجنس" : "الجنس الآخر"}</span>
                        </span>
                      </div>
                    )}
                    {/* Partner & Table Info - Single Row */}
                    <div className="flex items-center justify-between gap-4">
                      {/* Partner Info */}
                      <div className="flex flex-col items-center gap-2 flex-1">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          dark 
                            ? "bg-cyan-600/30 border border-cyan-500/50"
                            : "bg-cyan-100 border border-cyan-300"
                        }`}>
                          <Users className={`w-4 h-4 ${
                            dark ? "text-cyan-400" : "text-cyan-600"
                          }`} />
                        </div>
                        <div className="text-center">
                          <p className={`text-sm ${
                            dark ? "text-slate-400" : "text-gray-500"
                          }`}>
                            شريكك
                          </p>
                          <p className={`text-xl font-bold ${
                            dark ? "text-cyan-300" : "text-cyan-700"
                          }`}>
                            {matchResult === "المنظم" ? "المنظم" : `#${matchResult}`}
                          </p>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className={`w-px h-16 ${
                        dark ? "bg-slate-600" : "bg-gray-300"
                      }`}></div>

                      {/* Table Info */}
                      <div className="flex flex-col items-center gap-2 flex-1">
                        {tableNumber ? (
                          <>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              dark 
                                ? "bg-purple-600/30 border border-purple-500/50"
                                : "bg-purple-100 border border-purple-300"
                            }`}>
                              <Target className={`w-4 h-4 ${
                                dark ? "text-purple-400" : "text-purple-600"
                              }`} />
                            </div>
                            <div className="text-center">
                              <p className={`text-sm ${
                                dark ? "text-slate-400" : "text-gray-500"
                              }`}>
                                الطاولة
                              </p>
                              <p className={`text-xl font-bold ${
                                dark ? "text-purple-300" : "text-purple-700"
                              }`}>
                                #{tableNumber}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <Clock className={`w-5 h-5 ${
                              dark ? "text-amber-400" : "text-amber-600"
                            }`} />
                            <p className={`text-sm ${
                              dark ? "text-amber-300" : "text-amber-700"
                            }`}>
                              قريباً
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Discussion button above (tabs moved inside the box) */}
                  {(currentRound === 1 || currentRound === 2) && (
                    <div className="relative z-10 flex flex-col items-center gap-3 mb-4">
                      <button
                        onClick={() => setShowPromptTopicsModal(true)}
                        className={`${
                          dark
                            ? 'px-4 py-1.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-600/70 to-pink-600/70 hover:from-purple-600 hover:to-pink-600 text-white shadow-pink-500/20'
                            : 'px-4 py-1.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-500/80 to-pink-500/80 hover:from-purple-600 hover:to-pink-600 text-white shadow-pink-500/30'
                        }`}
                        aria-label="فتح أسئلة النقاش"
                        title="أسئلة النقاش"
                      >
                        أسئلة للنقاش
                      </button>
                    </div>
                  )}

                  {/* Discussion Questions Modal */}
                  <Suspense fallback={null}>
                    <PromptTopicsModal
                      open={showPromptTopicsModal}
                      onClose={() => setShowPromptTopicsModal(false)}
                    />
                  </Suspense>
                  
                  {/* Questions Slideshow - Always show for Round 1 */}
                  {(currentRound === 1 || currentRound === 2) ? (
                    <div ref={qCardRef} className={`relative z-10 mb-6 p-6 rounded-2xl border ${
                      currentQuestions[currentQuestionIndex].level === 0
                        ? dark 
                          ? "bg-gradient-to-br from-emerald-500/20 to-green-500/10 border-emerald-400/50 ring-1 ring-emerald-400/30 shadow-[0_0_24px_rgba(16,185,129,0.25)]" 
                          : "bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-300 ring-1 ring-emerald-300/40"
                        : currentQuestions[currentQuestionIndex].level === 1
                          ? dark 
                            ? "bg-gradient-to-br from-cyan-500/20 to-blue-600/10 border-cyan-400/50 ring-1 ring-cyan-400/30 shadow-[0_0_24px_rgba(34,211,238,0.25)]" 
                            : "bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-300 ring-1 ring-cyan-300/40"
                          : currentQuestions[currentQuestionIndex].level === 2
                            ? dark
                              ? "bg-gradient-to-br from-amber-500/20 to-orange-600/10 border-amber-400/50 ring-1 ring-amber-400/30 shadow-[0_0_24px_rgba(245,158,11,0.25)]"
                              : "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-300 ring-1 ring-amber-300/40"
                            : currentQuestions[currentQuestionIndex].level === 3
                              ? dark
                                ? "bg-gradient-to-br from-purple-500/20 to-pink-600/10 border-purple-400/50 ring-1 ring-purple-400/30 shadow-[0_0_24px_rgba(168,85,247,0.25)]"
                                : "bg-gradient-to-br from-purple-50 to-pink-50 border-purple-300 ring-1 ring-purple-300/40"
                              : dark
                                ? "bg-gradient-to-br from-green-500/20 to-teal-600/10 border-green-400/50 ring-1 ring-teal-400/30 shadow-[0_0_24px_rgba(20,184,166,0.25)]"
                                : "bg-gradient-to-br from-green-50 to-teal-50 border-green-300 ring-1 ring-green-300/40"
                    }`}>
                      <div dir="rtl" className="flex flex-col items-center gap-1 mb-5">
                        <div
                          className={`inline-flex items-center p-1 rounded-full border ${
                            dark
                              ? 'bg-slate-900/50 border-slate-700'
                              : 'bg-white/80 border-gray-200'
                          } shadow-sm`}
                        >
                          <button
                            onClick={() => {
                              setActiveQuestionSet('round1');
                              setCurrentQuestionIndex(0);
                            }}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                              activeQuestionSet === 'round1'
                                ? (dark
                                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                                    : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow')
                                : (dark
                                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')
                            }`}
                          >
                            المجموعة ١
                          </button>
                          <button
                            onClick={() => {
                              setActiveQuestionSet('event');
                              setCurrentQuestionIndex(0);
                            }}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                              activeQuestionSet === 'event'
                                ? (dark
                                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                                    : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow')
                                : (dark
                                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')
                            }`}
                          >
                            المجموعة ٢
                          </button>
                          <button
                            onClick={() => {
                              setActiveQuestionSet('set3');
                              setCurrentQuestionIndex(0);
                            }}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                              activeQuestionSet === 'set3'
                                ? (dark
                                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                                    : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow')
                                : (dark
                                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')
                            }`}
                          >
                            المجموعة ٣
                          </button>
                        </div>
                        <div className={`${dark ? 'text-slate-400' : 'text-gray-500'} text-xs`}>اختر أي مجموعة اسئلة</div>
                      </div>
                      <div className="text-center mb-6">
                        <div className="flex items-center justify-center gap-2 mb-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            currentQuestions[currentQuestionIndex].level === 0
                              ? "bg-gradient-to-r from-emerald-500 to-green-500"
                              : currentQuestions[currentQuestionIndex].level === 1
                                ? "bg-gradient-to-r from-cyan-500 to-blue-600"
                                : currentQuestions[currentQuestionIndex].level === 2
                                  ? "bg-gradient-to-r from-amber-500 to-orange-600"
                                  : currentQuestions[currentQuestionIndex].level === 3
                                    ? "bg-gradient-to-r from-purple-500 to-pink-600"
                                    : "bg-gradient-to-r from-green-500 to-teal-600"
                          }`}>
                            
                            {renderLevelIcon(currentQuestions[currentQuestionIndex].levelIcon)}
                          </div>
                          <h4 className={`text-lg font-bold ${
                            currentQuestions[currentQuestionIndex].level === 0
                              ? dark ? "text-emerald-200" : "text-emerald-800"
                              : currentQuestions[currentQuestionIndex].level === 1
                                ? dark ? "text-cyan-200" : "text-cyan-800"
                                : currentQuestions[currentQuestionIndex].level === 2
                                  ? dark ? "text-amber-200" : "text-amber-800"
                                  : currentQuestions[currentQuestionIndex].level === 3
                                    ? dark ? "text-purple-200" : "text-purple-800"
                                    : dark ? "text-green-200" : "text-green-800"
                          }`}>
                            {currentQuestions[currentQuestionIndex].levelTitle}
                          </h4>
                        </div>
                        <p className={`text-sm ${
                          currentQuestions[currentQuestionIndex].level === 0
                            ? dark ? "text-emerald-300" : "text-emerald-700"
                            : currentQuestions[currentQuestionIndex].level === 1
                              ? dark ? "text-cyan-300" : "text-cyan-700"
                              : currentQuestions[currentQuestionIndex].level === 2
                                ? dark ? "text-amber-300" : "text-amber-700"
                                : currentQuestions[currentQuestionIndex].level === 3
                                  ? dark ? "text-purple-300" : "text-purple-700"
                                  : dark ? "text-green-300" : "text-green-700"
                        }`}>
                          {currentQuestions[currentQuestionIndex].level === 0
                            ? "هذا المستوى يركز على إيجاد نقاط التواصل السريع والاهتمامات المشتركة"
                            : currentQuestions[currentQuestionIndex].level === 1
                              ? "هذا المستوى يركز على الشغف، الشخصية، ووجهات النظر بطريقة خفيفة"
                              : currentQuestions[currentQuestionIndex].level === 2
                                ? "هذا المستوى يركز على القيم الأساسية والمبادئ الشخصية العميقة"
                                : currentQuestions[currentQuestionIndex].level === 3
                                  ? "هذا المستوى يركز على مشاركة التجارب الشخصية والذكريات المؤثرة"
                                  : "هذا المستوى يركز على استكشاف السيناريوهات والتوافق في المواقف المختلفة"
                          }
                        </p>
                      </div>

                      {/* Question Card */}
                      <div
                        className={`relative p-6 rounded-xl ai-animated-border ${
                          currentQuestions[currentQuestionIndex].level === 0
                            ? (dark ? 'bg-gradient-to-b from-emerald-500/15 via-emerald-500/10 to-slate-900/40' : 'bg-gradient-to-b from-emerald-50 via-emerald-100/40 to-white')
                            : currentQuestions[currentQuestionIndex].level === 1
                              ? (dark ? 'bg-gradient-to-b from-cyan-500/15 via-cyan-500/10 to-slate-900/40' : 'bg-gradient-to-b from-cyan-50 via-cyan-100/40 to-white')
                              : currentQuestions[currentQuestionIndex].level === 2
                                ? (dark ? 'bg-gradient-to-b from-amber-500/15 via-amber-500/10 to-slate-900/40' : 'bg-gradient-to-b from-amber-50 via-amber-100/40 to-white')
                                : currentQuestions[currentQuestionIndex].level === 3
                                  ? (dark ? 'bg-gradient-to-b from-purple-500/15 via-pink-500/10 to-slate-900/40' : 'bg-gradient-to-b from-purple-50 via-pink-100/40 to-white')
                                  : (dark ? 'bg-gradient-to-b from-teal-500/15 via-teal-500/10 to-slate-900/40' : 'bg-gradient-to-b from-teal-50 via-teal-100/40 to-white')
                        } shadow-lg backdrop-blur-sm ${
                          questionTransition === 'next' ? 'animate-slide-in-right' :
                          questionTransition === 'prev' ? 'animate-slide-in-left' : ''
                        }`}
                        style={{
                          ['--ab-size' as any]: '3px',
                          ['--ab-speed' as any]: '9s',
                          ['--ab-c1' as any]:
                            currentQuestions[currentQuestionIndex].level === 0
                              ? '#34d399' /* emerald-400 */
                              : currentQuestions[currentQuestionIndex].level === 1
                                ? '#22d3ee' /* cyan-400 */
                                : currentQuestions[currentQuestionIndex].level === 2
                                  ? '#f59e0b' /* amber-500 */
                                  : currentQuestions[currentQuestionIndex].level === 3
                                    ? '#a855f7' /* purple-500 */
                                    : '#10b981' /* emerald-500 */,
                          ['--ab-c2' as any]:
                            currentQuestions[currentQuestionIndex].level === 0
                              ? '#10b981' /* emerald-500 */
                              : currentQuestions[currentQuestionIndex].level === 1
                                ? '#3b82f6' /* blue-500 */
                                : currentQuestions[currentQuestionIndex].level === 2
                                  ? '#f97316' /* orange-500 */
                                  : currentQuestions[currentQuestionIndex].level === 3
                                    ? '#ec4899' /* pink-500 */
                                    : '#14b8a6' /* teal-500 */,
                          ['--ab-c3' as any]:
                            currentQuestions[currentQuestionIndex].level === 0
                              ? '#14b8a6' /* teal-500 */
                              : currentQuestions[currentQuestionIndex].level === 1
                                ? '#60a5fa' /* blue-400 */
                                : currentQuestions[currentQuestionIndex].level === 2
                                  ? '#fb923c' /* orange-400 */
                                  : currentQuestions[currentQuestionIndex].level === 3
                                    ? '#f472b6' /* pink-400 */
                                    : '#34d399' /* emerald-400 */,
                        }}>
                        {/* Question Number */}
                        <div className="absolute -top-3 right-4 z-30">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg ${
                            currentQuestions[currentQuestionIndex].level === 0
                              ? "bg-gradient-to-r from-emerald-500 to-green-500"
                              : currentQuestions[currentQuestionIndex].level === 1
                                ? "bg-gradient-to-r from-cyan-500 to-blue-600"
                                : currentQuestions[currentQuestionIndex].level === 2
                                  ? "bg-gradient-to-r from-amber-500 to-orange-600"
                                  : currentQuestions[currentQuestionIndex].level === 3
                                    ? "bg-gradient-to-r from-purple-500 to-pink-600"
                                    : "bg-gradient-to-r from-green-500 to-teal-600"
                          }`}>
                            <span className="text-white font-bold text-sm">{currentQuestionIndex + 1}</span>
                          </div>
                        </div>

                        {/* Question Title + Text (animated) */}
                        {/* Fixed-height container to avoid layout shift; inner content scrolls if long */}
                        <div className="h-24 sm:h-28 md:h-32 lg:h-36 overflow-hidden">
                        <AnimatePresence mode="wait">
  <motion.div
    key={currentQuestionIndex}
    initial={{
      opacity: 0,
      x: questionTransition === 'next' ? 24 : questionTransition === 'prev' ? -24 : 12,
      filter: 'blur(4px)',
      scale: 0.99,
    }}
    animate={{
      opacity: 1,
      x: 0,
      filter: 'blur(0px)',
      scale: 1,
      transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
    }}
    exit={{
      opacity: 0,
      x: questionTransition === 'next' ? -24 : questionTransition === 'prev' ? 24 : -12,
      filter: 'blur(4px)',
      scale: 0.99,
      transition: { duration: 0.25, ease: 'easeIn' },
    }}
    className="h-full overflow-y-auto pr-1"
  >                              <h5 className={`text-lg md:text-xl font-bold mb-2 ${dark ? "text-slate-200" : "text-gray-800"}`}>
                                {currentQuestions[currentQuestionIndex].title}
                              </h5>

                              <p className={`text-base md:text-lg leading-relaxed ${dark ? "text-slate-300" : "text-gray-700"}`}>
                                {currentQuestions[currentQuestionIndex].question}
                              </p>
                            </motion.div>
                          </AnimatePresence>
                        </div>

                        {/* 5-Minute Warning Notification */}
                        {showFiveMinuteWarning && (
                          <div className={`mt-6 p-4 rounded-xl border animate-in slide-in-from-top-2 duration-500 ${
                            dark 
                              ? "bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-blue-400/30" 
                              : "bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-300"
                          }`}>
                            <div className="flex items-start gap-3">
                              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                                dark ? "bg-blue-500/20" : "bg-blue-100"
                              }`}>
                                <Bell className={`w-5 h-5 ${dark ? "text-blue-400" : "text-blue-600"} animate-pulse`} />
                              </div>
                              
                              <div className="flex-1">
                                <h4 className={`text-sm font-bold mb-1 ${
                                  dark ? "text-blue-200" : "text-blue-800"
                                }`}>
                                  ⏰ باقي 5 دقائق
                                </h4>
                                <p className={`text-sm leading-relaxed ${
                                  dark ? "text-blue-300/90" : "text-blue-700"
                                }`}>
                                  سيظهر نموذج التقييم قريباً. بعد تعبئته، ستحصلون على تحليل فوري من الذكاء الاصطناعي يشرح لكم سبب المطابقة بينكم! 🤖✨
                                </p>
                              </div>

                              <button
                                className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                                  dark 
                                    ? "hover:bg-blue-500/20 text-blue-400" 
                                    : "hover:bg-blue-100 text-blue-600"
                                }`}
                                onClick={() => setShowFiveMinuteWarning(false)}
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Gentle Pace Nudge */}
                        {showPaceNudge && (
                          <div className={`mt-6 p-4 rounded-xl border animate-in slide-in-from-top-2 duration-300 ${
                            dark 
                              ? "bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-orange-400/30" 
                              : "bg-gradient-to-r from-orange-50 to-amber-50 border-orange-300"
                          }`}>
                            <div className="flex items-start gap-3">
                              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                                dark ? "bg-orange-500/20" : "bg-orange-100"
                              }`}>
                                <Clock className={`w-5 h-5 ${dark ? "text-orange-400" : "text-orange-600"}`} />
                              </div>
                              
                              <div className="flex-1">
                                <h4 className={`text-sm font-bold mb-1 ${
                                  dark ? "text-orange-200" : "text-orange-800"
                                }`}>
                                  تذكير لطيف
                                </h4>
                                <p className={`text-sm leading-relaxed ${
                                  dark ? "text-orange-300/90" : "text-orange-700"
                                }`}>
                                  لديكم {round1Questions.length - currentQuestionIndex - 1} سؤال آخر - جربوا الانتقال للسؤال التالي لاستكشاف المزيد من المواضيع
                                </p>
                              </div>

                              <button
                                className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                                  dark 
                                    ? "hover:bg-orange-500/20 text-orange-400" 
                                    : "hover:bg-orange-100 text-orange-600"
                                }`}
                                onClick={() => setShowPaceNudge(false)}
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Navigation */}
                        <div className="flex items-center justify-between mt-6">
                          <button
onClick={() => {
  setQuestionTransition('prev')
  setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))
  setTimeout(() => setQuestionTransition('none'), 400)
}}
                            disabled={currentQuestionIndex === 0}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                              currentQuestionIndex === 0
                                ? dark
                                  ? "bg-slate-700/50 text-slate-500 cursor-not-allowed"
                                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
                                : dark
                                  ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            }`}
                          >
                            <ChevronRight className="w-4 h-4" />
                            السابق
                          </button>


                          <button
onClick={() => {
  setQuestionTransition('next')
  setCurrentQuestionIndex(Math.min(currentQuestions.length - 1, currentQuestionIndex + 1))
  setTimeout(() => setQuestionTransition('none'), 400)
}}                            disabled={currentQuestionIndex === currentQuestions.length - 1}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                              currentQuestionIndex === currentQuestions.length - 1
                                ? dark
                                  ? "bg-slate-700/50 text-slate-500 cursor-not-allowed"
                                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
                                : dark
                                  ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            }`}
                          >
                            التالي
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-4">
                          <div className={`w-full h-2 rounded-full ${dark ? "bg-slate-700" : "bg-gray-200"}`}>
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                currentQuestions[currentQuestionIndex].level === 0
                                  ? "bg-gradient-to-r from-emerald-500 to-green-500"
                                  : currentQuestions[currentQuestionIndex].level === 1
                                    ? "bg-gradient-to-r from-cyan-500 to-blue-600"
                                    : currentQuestions[currentQuestionIndex].level === 2
                                      ? "bg-gradient-to-r from-amber-500 to-orange-600"
                                      : currentQuestions[currentQuestionIndex].level === 3
                                        ? "bg-gradient-to-r from-purple-500 to-pink-600"
                                        : "bg-gradient-to-r from-green-500 to-teal-600"
                              }`}
                              style={{ width: `${((currentQuestionIndex + 1) / currentQuestions.length) * 100}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs mt-1">
                            <span className={dark ? "text-slate-400" : "text-gray-500"}>
                              السؤال {currentQuestionIndex + 1}
                            </span>
                            <span className={dark ? "text-slate-400" : "text-gray-500"}>
                              من {currentQuestions.length}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                </>
              ) : (
                <>
                  
                  {/* Match Info Card - Compact - Same design as timer not active */}
                  <div ref={matchCardRef} className={`relative z-10 mb-6 p-4 rounded-xl border shadow-md ${
                    dark 
                      ? "bg-slate-800/50 border-slate-600/50"
                      : "bg-white/80 border-gray-200"
                  }`}>
                    {currentRound === 1 && round1AccessorySrc && (
                      <img
                        src={round1AccessorySrc}
                        alt=""
                        aria-hidden="true"
                        className="pointer-events-none select-none absolute -top-6 -left-4 w-16 md:w-20 h-auto drop-shadow-xl opacity-95"
                        style={{ transform: round1AccessorySrc === '/PinkRibbon.png' ? 'rotate(-12deg)' : 'rotate(8deg)' }}
                      />
                    )}
                    {(currentRound === 1 || currentRound === 2) && (
                      <div className="flex justify-center mb-3">
                        <span
                          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border shadow-sm tracking-wide ${
                            currentRound === 1
                              ? dark
                                ? "bg-gradient-to-r from-cyan-600/25 to-emerald-600/20 text-cyan-100 border-cyan-400/30"
                                : "bg-gradient-to-r from-cyan-100 to-emerald-100 text-cyan-800 border-cyan-200"
                              : dark
                                ? "bg-gradient-to-r from-pink-600/25 to-purple-600/20 text-pink-100 border-pink-400/30"
                                : "bg-gradient-to-r from-pink-100 to-purple-100 text-pink-800 border-pink-200"
                          }`}
                          aria-label={currentRound === 1 ? "مطابقة نفس الجنس" : "مطابقة الجنس الآخر"}
                          title={currentRound === 1 ? "Same-gender match" : "Opposite-gender match"}
                        >
                          <span className={`w-2 h-2 rounded-full ${currentRound === 1 ? "bg-cyan-400" : "bg-pink-400"}`} />
                          <span>{currentRound === 1 ? "نفس الجنس" : "الجنس الآخر"}</span>
                        </span>
                      </div>
                    )}
                    {/* Partner & Table Info - Single Row */}
                    <div className="flex items-center justify-between gap-4">
                      {/* Partner Info */}
                      <div className="flex flex-col items-center gap-2 flex-1">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          dark 
                            ? "bg-cyan-600/30 border border-cyan-500/50"
                            : "bg-cyan-100 border border-cyan-300"
                        }`}>
                          <Users className={`w-4 h-4 ${
                            dark ? "text-cyan-400" : "text-cyan-600"
                          }`} />
                        </div>
                        <div className="text-center">
                          <p className={`text-sm ${
                            dark ? "text-slate-400" : "text-gray-500"
                          }`}>
                            شريكك
                          </p>
                          <p className={`text-xl font-bold ${
                            dark ? "text-cyan-300" : "text-cyan-700"
                          }`}>
                            {matchResult === "المنظم" ? "المنظم" : `#${matchResult}`}
                          </p>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className={`w-px h-16 ${
                        dark ? "bg-slate-600" : "bg-gray-300"
                      }`}></div>

                      {/* Table Info */}
                      <div className="flex flex-col items-center gap-2 flex-1">
                        {tableNumber ? (
                          <>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              dark 
                                ? "bg-purple-600/30 border border-purple-500/50"
                                : "bg-purple-100 border border-purple-300"
                            }`}>
                              <Target className={`w-4 h-4 ${
                                dark ? "text-purple-400" : "text-purple-600"
                              }`} />
                            </div>
                            <div className="text-center">
                              <p className={`text-sm ${
                                dark ? "text-slate-400" : "text-gray-500"
                              }`}>
                                الطاولة
                              </p>
                              <p className={`text-xl font-bold ${
                                dark ? "text-purple-300" : "text-purple-700"
                              }`}>
                                #{tableNumber}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <Clock className={`w-5 h-5 ${
                              dark ? "text-amber-400" : "text-amber-600"
                            }`} />
                            <p className={`text-sm ${
                              dark ? "text-amber-300" : "text-amber-700"
                            }`}>
                              قريباً
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Discussion button above (tabs moved inside the box) */}
                  {(currentRound === 1 || currentRound === 2) && (
                    <div className="relative z-10 flex flex-col items-center gap-3 mb-4">
                      <button
                        onClick={() => setShowPromptTopicsModal(true)}
                        className={`${
                          dark
                            ? 'px-4 py-1.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-600/70 to-pink-600/70 hover:from-purple-600 hover:to-pink-600 text-white shadow-pink-500/20'
                            : 'px-4 py-1.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-500/80 to-pink-500/80 hover:from-purple-600 hover:to-pink-600 text-white shadow-pink-500/30'
                        }`}
                        aria-label="فتح أسئلة النقاش"
                        title="أسئلة النقاش"
                      >
                        أسئلة للنقاش
                      </button>
                    </div>
                  )}

                  {/* Round 1 Questions Slideshow - Always show for Round 1 */}
                  {(currentRound === 1 || currentRound === 2) && (
                    <div ref={qCardRef} className={`relative z-10 mb-6 p-6 rounded-2xl border ${
                      currentQuestions[currentQuestionIndex].level === 0
                        ? dark 
                          ? "bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-400/30" 
                          : "bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200"
                        : currentQuestions[currentQuestionIndex].level === 1
                          ? dark 
                            ? "bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border-cyan-400/30" 
                            : "bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-200"
                          : currentQuestions[currentQuestionIndex].level === 2
                            ? dark
                              ? "bg-gradient-to-br from-amber-500/10 to-orange-600/10 border-amber-400/30"
                              : "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200"
                            : currentQuestions[currentQuestionIndex].level === 3
                              ? dark
                                ? "bg-gradient-to-br from-purple-500/10 to-pink-600/10 border-purple-400/30"
                                : "bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200"
                              : dark
                                ? "bg-gradient-to-br from-green-500/10 to-teal-600/10 border-green-400/30"
                                : "bg-gradient-to-br from-green-50 to-teal-50 border-green-200"
                    }`}>
                      <div dir="rtl" className="flex flex-col items-center gap-1 mb-5">
                        <div
                          className={`inline-flex items-center p-1 rounded-full border ${
                            dark
                              ? 'bg-slate-900/50 border-slate-700'
                              : 'bg-white/80 border-gray-200'
                          } shadow-sm`}
                        >
                          <button
                            onClick={() => {
                              setActiveQuestionSet('round1');
                              setCurrentQuestionIndex(0);
                            }}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                              activeQuestionSet === 'round1'
                                ? (dark
                                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                                    : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow')
                                : (dark
                                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')
                            }`}
                          >
                            المجموعة ١
                          </button>
                          <button
                            onClick={() => {
                              setActiveQuestionSet('event');
                              setCurrentQuestionIndex(0);
                            }}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                              activeQuestionSet === 'event'
                                ? (dark
                                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                                    : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow')
                                : (dark
                                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')
                            }`}
                          >
                            المجموعة ٢
                          </button>
                          <button
                            onClick={() => {
                              setActiveQuestionSet('set3');
                              setCurrentQuestionIndex(0);
                            }}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                              activeQuestionSet === 'set3'
                                ? (dark
                                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                                    : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow')
                                : (dark
                                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')
                            }`}
                          >
                            المجموعة ٣
                          </button>
                        </div>
                        <div className={`${dark ? 'text-slate-400' : 'text-gray-500'} text-xs`}>اختر مجموعة الأسئلة</div>
                      </div>
                      <div className="text-center mb-6">
                        <div className="flex items-center justify-center gap-2 mb-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            currentQuestions[currentQuestionIndex].level === 0
                              ? "bg-gradient-to-r from-emerald-500 to-green-500"
                              : currentQuestions[currentQuestionIndex].level === 1
                                ? "bg-gradient-to-r from-cyan-500 to-blue-600"
                                : currentQuestions[currentQuestionIndex].level === 2
                                  ? "bg-gradient-to-r from-amber-500 to-orange-600"
                                  : currentQuestions[currentQuestionIndex].level === 3
                                    ? "bg-gradient-to-r from-purple-500 to-pink-600"
                                    : "bg-gradient-to-r from-green-500 to-teal-600"
                          }`}>
                            {renderLevelIcon(currentQuestions[currentQuestionIndex].levelIcon)}
                          </div>
                          <h4 className={`text-lg font-bold ${
                            currentQuestions[currentQuestionIndex].level === 0
                              ? dark ? "text-emerald-200" : "text-emerald-800"
                              : currentQuestions[currentQuestionIndex].level === 1
                                ? dark ? "text-cyan-200" : "text-cyan-800"
                                : currentQuestions[currentQuestionIndex].level === 2
                                  ? dark ? "text-amber-200" : "text-amber-800"
                                  : currentQuestions[currentQuestionIndex].level === 3
                                    ? dark ? "text-purple-200" : "text-purple-800"
                                    : dark ? "text-green-200" : "text-green-800"
                          }`}>
                            {currentQuestions[currentQuestionIndex].levelTitle}
                          </h4>
                        </div>
                        <p className={`text-sm ${
                          currentQuestions[currentQuestionIndex].level === 0
                            ? dark ? "text-emerald-300" : "text-emerald-700"
                            : currentQuestions[currentQuestionIndex].level === 1
                              ? dark ? "text-cyan-300" : "text-cyan-700"
                              : currentQuestions[currentQuestionIndex].level === 2
                                ? dark ? "text-amber-300" : "text-amber-700"
                                : currentQuestions[currentQuestionIndex].level === 3
                                  ? dark ? "text-purple-300" : "text-purple-700"
                                  : dark ? "text-green-300" : "text-green-700"
                        }`}>
                          {currentQuestions[currentQuestionIndex].level === 0
                            ? "هذا المستوى يركز على إيجاد نقاط التواصل السريع والاهتمامات المشتركة"
                            : currentQuestions[currentQuestionIndex].level === 1
                              ? "هذا المستوى يركز على الشغف، الشخصية، ووجهات النظر بطريقة خفيفة"
                              : currentQuestions[currentQuestionIndex].level === 2
                                ? "هذا المستوى يركز على القيم الأساسية والمبادئ الشخصية العميقة"
                                : currentQuestions[currentQuestionIndex].level === 3
                                  ? "هذا المستوى يركز على مشاركة التجارب الشخصية والذكريات المؤثرة"
                                  : "هذا المستوى يركز على استكشاف السيناريوهات والتوافق في المواقف المختلفة"
                          }
                        </p>
                      </div>

                      <div className="relative">
                        {/* Question Number */}
                        <div className="absolute -top-3 right-4 z-30">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg ${
                            currentQuestions[currentQuestionIndex].level === 0
                              ? "bg-gradient-to-r from-emerald-500 to-green-500"
                              : currentQuestions[currentQuestionIndex].level === 1
                                ? "bg-gradient-to-r from-cyan-500 to-blue-600"
                                : currentQuestions[currentQuestionIndex].level === 2
                                  ? "bg-gradient-to-r from-amber-500 to-orange-600"
                                  : currentQuestions[currentQuestionIndex].level === 3
                                    ? "bg-gradient-to-r from-purple-500 to-pink-600"
                                    : "bg-gradient-to-r from-green-500 to-teal-600"
                          }`}>
                            <span className="text-white font-bold text-sm">{currentQuestionIndex + 1}</span>
                          </div>
                        </div>

                        {/* Question Title + Text - fixed-height container to avoid layout shift */}
                        <div className="h-24 sm:h-28 md:h-32 lg:h-36 overflow-hidden">
  <AnimatePresence mode="wait">
    <motion.div
      key={currentQuestionIndex}
      initial={{
        opacity: 0,
        x: questionTransition === 'next' ? 24 : questionTransition === 'prev' ? -24 : 12,
        filter: 'blur(4px)',
        scale: 0.99,
      }}
      animate={{
        opacity: 1,
        x: 0,
        filter: 'blur(0px)',
        scale: 1,
        transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
      }}
      exit={{
        opacity: 0,
        x: questionTransition === 'next' ? -24 : questionTransition === 'prev' ? 24 : -12,
        filter: 'blur(4px)',
        scale: 0.99,
        transition: { duration: 0.25, ease: 'easeIn' },
      }}
      className="h-full overflow-y-auto pr-1"
    >
      {/* Question Title */}
      <h5 className={`text-lg md:text-xl font-bold mb-2 ${dark ? "text-slate-200" : "text-gray-800"}`}>
        {currentQuestions[currentQuestionIndex].title}
      </h5>

      {/* Question Text */}
      <p className={`text-base md:text-lg leading-relaxed ${dark ? "text-slate-300" : "text-gray-700"}`}>
        {currentQuestions[currentQuestionIndex].question}
      </p>
    </motion.div>
  </AnimatePresence>
</div>
                        {/* Navigation */}
                        <div className="flex justify-between items-center mt-6">
                          <button
                            onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                            disabled={currentQuestionIndex === 0}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                              currentQuestionIndex === 0
                                ? dark ? "bg-slate-600/50 text-slate-400 cursor-not-allowed" : "bg-gray-200/50 text-gray-400 cursor-not-allowed"
                                : dark ? "bg-slate-600 text-slate-200 hover:bg-slate-500" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            }`}
                          >
                            <ChevronRight className="w-4 h-4" />
                            السابق
                          </button>

                          <div className={`text-sm font-medium ${dark ? "text-slate-400" : "text-gray-500"}`}>
                            {currentQuestionIndex + 1} من {currentQuestions.length}
                          </div>

                          <button
                            onClick={() => setCurrentQuestionIndex(Math.min(currentQuestions.length - 1, currentQuestionIndex + 1))}
                            disabled={currentQuestionIndex === currentQuestions.length - 1}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                              currentQuestionIndex === currentQuestions.length - 1
                                ? dark ? "bg-slate-600/50 text-slate-400 cursor-not-allowed" : "bg-gray-200/50 text-gray-400 cursor-not-allowed"
                                : dark ? "bg-slate-600 text-slate-200 hover:bg-slate-500" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            }`}
                          >
                            التالي
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Progress indicator */}
                        <div className="mt-4">
                          <div className={`w-full h-2 rounded-full ${dark ? "bg-slate-600" : "bg-gray-200"}`}>
                            <div 
                              className={`h-2 rounded-full transition-all duration-300 ${
                                currentQuestions[currentQuestionIndex].level === 0
                                  ? "bg-gradient-to-r from-emerald-500 to-green-500"
                                  : currentQuestions[currentQuestionIndex].level === 1
                                    ? "bg-gradient-to-r from-cyan-500 to-blue-600"
                                    : currentQuestions[currentQuestionIndex].level === 2
                                      ? "bg-gradient-to-r from-amber-500 to-orange-600"
                                      : currentQuestions[currentQuestionIndex].level === 3
                                        ? "bg-gradient-to-r from-purple-500 to-pink-600"
                                        : "bg-gradient-to-r from-green-500 to-teal-600"
                              }`}
                              style={{ width: `${((currentQuestionIndex + 1) / currentQuestions.length) * 100}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-2 text-xs">
                            <span className={dark ? "text-slate-400" : "text-gray-500"}>
                              السؤال {currentQuestionIndex + 1}
                            </span>
                            <span className={dark ? "text-slate-400" : "text-gray-500"}>
                              من {currentQuestions.length}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}


                  {/* Round 1 Recommended Time Message - Shows every 2 minutes for 15 seconds */}
                  {currentRound === 1 && round1TimerStarted && (round1LocalTimer >= 2685 || round1LocalTimer % 120 < 15 || round1LocalTimer <= 1800) && (
                    <div className={`mb-4 p-4 rounded-xl border animate-in slide-in-from-top-2 duration-300 ${
                      dark 
                        ? "bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-blue-400/30"
                        : "bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200"
                    }`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Clock className={`w-5 h-5 ${dark ? "text-blue-400" : "text-blue-600"}`} />
                          <div>
                            <p className={`text-sm font-semibold ${dark ? "text-blue-300" : "text-blue-700"}`}>
                              الوقت الموصى به: 45 دقيقة
                            </p>
                            <p className={`text-xs ${dark ? "text-slate-400" : "text-gray-600"}`}>
                              الحد الأدنى 30 دقيقة
                            </p>
                          </div>
                        </div>
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                          round1LocalTimer <= 0 // Time's up
                            ? dark ? "bg-green-500/20 border border-green-400/30" : "bg-green-100 border border-green-300"
                            : round1LocalTimer <= 900 // Last 15 minutes
                              ? dark ? "bg-red-500/20 border border-red-400/30" : "bg-red-100 border border-red-300"
                              : round1LocalTimer <= 1800 // 30 minutes or less
                                ? dark ? "bg-yellow-500/20 border border-yellow-400/30" : "bg-yellow-100 border border-yellow-300"
                                : dark ? "bg-blue-500/20 border border-blue-400/30" : "bg-blue-100 border border-blue-300"
                        }`}>
                          <Clock className={`w-4 h-4 ${
                            round1LocalTimer <= 0
                              ? dark ? "text-green-400" : "text-green-600"
                              : round1LocalTimer <= 900
                                ? dark ? "text-red-400" : "text-red-600"
                                : round1LocalTimer <= 1800
                                  ? dark ? "text-yellow-400" : "text-yellow-600"
                                  : dark ? "text-blue-400" : "text-blue-600"
                          }`} />
                          <span className={`text-sm font-bold ${
                            round1LocalTimer <= 0
                              ? dark ? "text-green-300" : "text-green-700"
                              : round1LocalTimer <= 900
                                ? dark ? "text-red-300" : "text-red-700"
                                : round1LocalTimer <= 1800
                                  ? dark ? "text-yellow-300" : "text-yellow-700"
                                  : dark ? "text-blue-300" : "text-blue-700"
                          }`}>
                            {round1LocalTimer <= 0 ? "انتهى!" : `${Math.floor(round1LocalTimer / 60)}:${(round1LocalTimer % 60).toString().padStart(2, '0')}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                </>
              )}
            </div>
</div>
          </section>
        )}

                

        {step === 5 && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
            <div className={`relative backdrop-blur-xl border rounded-2xl p-8 shadow-2xl ${
              dark ? "bg-white/10 border-white/20" : "bg-black/10 border-gray-300/30"
            }`}>
              {/* History Icon - Left corner - TEMPORARILY COMMENTED OUT */}
              {false && historyMatches.length > 0 && (
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
                <ParticipantBadge size="small" />
              </div>

              <div className="flex justify-center mb-4">
                <Users className={`w-12 h-12 animate-pulse ${
                  dark ? "text-slate-400" : "text-gray-600"
                }`} />
              </div>
              <h3 className={`text-lg font-semibold text-center mb-4 ${dark ? "text-slate-200" : "text-gray-800"}`}>
                انتهت الجولة {currentRound}
    </h3>

              {/* Round 1 Recommended Time Message - Shows in feedback too */}
              {currentRound === 1 && round1TimerStarted && (round1LocalTimer >= 2685 || round1LocalTimer % 120 < 15 || round1LocalTimer <= 1800) && (
                <div className={`mb-4 p-4 rounded-xl border animate-in slide-in-from-top-2 duration-300 mx-auto max-w-md ${
                  dark 
                    ? "bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-blue-400/30"
                    : "bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200"
                }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Clock className={`w-5 h-5 ${dark ? "text-blue-400" : "text-blue-600"}`} />
                      <div>
                        <p className={`text-sm font-semibold ${dark ? "text-blue-300" : "text-blue-700"}`}>
                          الوقت الموصى به: 45 دقيقة
                        </p>
                        <p className={`text-xs ${dark ? "text-slate-400" : "text-gray-600"}`}>
                          الحد الأدنى 30 دقيقة
                        </p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                      round1LocalTimer <= 0 // Time's up
                        ? dark ? "bg-green-500/20 border border-green-400/30" : "bg-green-100 border border-green-300"
                        : round1LocalTimer <= 900 // Last 15 minutes
                          ? dark ? "bg-red-500/20 border border-red-400/30" : "bg-red-100 border border-red-300"
                          : round1LocalTimer <= 1800 // 30 minutes or less
                            ? dark ? "bg-yellow-500/20 border border-yellow-400/30" : "bg-yellow-100 border border-yellow-300"
                            : dark ? "bg-blue-500/20 border border-blue-400/30" : "bg-blue-100 border border-blue-300"
                    }`}>
                      <Clock className={`w-4 h-4 ${
                        round1LocalTimer <= 0
                          ? dark ? "text-green-400" : "text-green-600"
                          : round1LocalTimer <= 900
                            ? dark ? "text-red-400" : "text-red-600"
                            : round1LocalTimer <= 1800
                              ? dark ? "text-yellow-400" : "text-yellow-600"
                              : dark ? "text-blue-400" : "text-blue-600"
                      }`} />
                      <span className={`text-sm font-bold ${
                        round1LocalTimer <= 0
                          ? dark ? "text-green-300" : "text-green-700"
                          : round1LocalTimer <= 900
                            ? dark ? "text-red-300" : "text-red-700"
                            : round1LocalTimer <= 1800
                              ? dark ? "text-yellow-300" : "text-yellow-700"
                              : dark ? "text-blue-300" : "text-blue-700"
                      }`}>
                        {round1LocalTimer <= 0 ? "انتهى!" : `${Math.floor(round1LocalTimer / 60)}:${(round1LocalTimer % 60).toString().padStart(2, '0')}`}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <p className={`text-center text-sm italic mb-6 ${
                dark ? "text-slate-300" : "text-gray-600"
              }`}>
      تحقق من رقم التوكن الخاص بك في الصفحة الرئيسية بعد نصف ساعة إلى ساعة لمعرفة ما إذا كان هناك توافق متبادل
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
                  <Suspense fallback={<div className="text-center py-4"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto"></div></div>}>
                    <AIQuestionsGenerator 
                      secureToken={secureToken}
                      dark={dark}
                      currentRound={currentRound}
                    />
                  </Suspense>
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
              {/* History Icon - Left corner - TEMPORARILY COMMENTED OUT */}
              {false && historyMatches.length > 0 && (
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
                <ParticipantBadge size="small" />
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
                    الشخص المتوافق معك في الجولة {currentRound} هو رقم {matchResult}
                  </h3>
                  

                </>
              ) : (
                // Show this block if conversation has started and timer is running
                <>
                  // ... existing code ...
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
                <ParticipantBadge size="small" />
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


                  <div className="flex justify-center">
                  </div>
                </>
              )}
    </div>
  </section>
        )}

        {/* Main feedback/result + previous matches layout */}
        {modalStep && (
          <>
            {/* Round 1 Recommended Time Message - Always visible in feedback */}
            {currentRound === 1 && round1TimerStarted && (
              <div className={`mb-6 p-4 rounded-xl border animate-in slide-in-from-top-2 duration-300 max-w-4xl mx-auto ${
                dark 
                  ? "bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-blue-400/30"
                  : "bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200"
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className={`w-5 h-5 ${dark ? "text-blue-400" : "text-blue-600"}`} />
                    <div>
                      <p className={`text-sm font-semibold ${dark ? "text-blue-300" : "text-blue-700"}`}>
                        الوقت الموصى به: 45 دقيقة
                      </p>
                      <p className={`text-xs ${dark ? "text-slate-400" : "text-gray-600"}`}>
                        الحد الأدنى 30 دقيقة
                      </p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                    round1LocalTimer <= 0 // Time's up
                      ? dark ? "bg-green-500/20 border border-green-400/30" : "bg-green-100 border border-green-300"
                      : round1LocalTimer <= 900 // Last 15 minutes
                        ? dark ? "bg-red-500/20 border border-red-400/30" : "bg-red-100 border border-red-300"
                        : round1LocalTimer <= 1800 // 30 minutes or less
                          ? dark ? "bg-yellow-500/20 border border-yellow-400/30" : "bg-yellow-100 border border-yellow-300"
                          : dark ? "bg-blue-500/20 border border-blue-400/30" : "bg-blue-100 border border-blue-300"
                  }`}>
                    <Clock className={`w-4 h-4 ${
                      round1LocalTimer <= 0
                        ? dark ? "text-green-400" : "text-green-600"
                        : round1LocalTimer <= 900
                          ? dark ? "text-red-400" : "text-red-600"
                          : round1LocalTimer <= 1800
                            ? dark ? "text-yellow-400" : "text-yellow-600"
                            : dark ? "text-blue-400" : "text-blue-600"
                    }`} />
                    <span className={`text-sm font-bold ${
                      round1LocalTimer <= 0
                        ? dark ? "text-green-300" : "text-green-700"
                        : round1LocalTimer <= 900
                          ? dark ? "text-red-300" : "text-red-700"
                          : round1LocalTimer <= 1800
                            ? dark ? "text-yellow-300" : "text-yellow-700"
                            : dark ? "text-blue-300" : "text-blue-700"
                    }`}>
                      {round1LocalTimer <= 0 ? "انتهى!" : `${Math.floor(round1LocalTimer / 60)}:${(round1LocalTimer % 60).toString().padStart(2, '0')}`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={feedbackRef} className="flex flex-col md:flex-row gap-6 w-full max-w-4xl mx-auto">
              {/* Main Content */}
              <div className="flex-1 min-w-0">
              {modalStep === "feedback" ? (
                <>
                  {/* Sticky Header: Pair info + Round chip + Progress */}
                  <div className={`sticky top-0 z-10 -mt-2 mb-4 px-4 py-3 rounded-t-xl backdrop-blur ${dark ? 'bg-slate-900/70 border-b border-slate-700/60' : 'bg-white/80 border-b border-gray-200/60'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`text-sm font-bold ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                        <span>#{assignedNumber}</span>
                        <span className={`${dark ? 'text-slate-500' : 'text-gray-400'} mx-2`}>•</span>
                        <span>{matchResult === 'المنظم' ? 'المنظم' : `#${matchResult}`}</span>
                      </div>
                      <div className={`ml-auto text-xs px-3 py-1.5 rounded-full font-bold shadow-sm bg-gradient-to-r ${dark ? 'from-fuchsia-600/40 to-cyan-500/40 text-fuchsia-100' : 'from-fuchsia-500 to-cyan-500 text-white'}`}>
                        الجولة {currentRound}
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className={`w-full h-1.5 rounded-full ${dark ? 'bg-slate-700/60' : 'bg-gray-200/80'}`}>
                        <div className={`h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500`} style={{ width: `${getFeedbackProgress()}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Anonymous Privacy Header */}
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={`mb-8 p-6 rounded-xl border-2 ${dark ? 'bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border-indigo-400/40' : 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-300/60'}`}>
                    <div className="text-center mb-4">
                      <div className={`inline-flex items-center gap-3 px-4 py-2 rounded-full ${dark ? 'bg-indigo-600/20 text-indigo-200' : 'bg-indigo-100 text-indigo-700'}`}>
                        <Shield className="w-6 h-6" />
                        <span className="font-bold text-lg">تقييم مجهول وآمن</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${dark ? 'bg-slate-700/50 text-slate-200' : 'bg-white/70 text-gray-700'}`}>
                        <LockKeyhole className="w-4 h-4" />
                        <span className="text-sm font-medium">مشفر</span>
                      </div>
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${dark ? 'bg-slate-700/50 text-slate-200' : 'bg-white/70 text-gray-700'}`}>
                        <UserCheck className="w-4 h-4" />
                        <span className="text-sm font-medium">مجهول</span>
                      </div>
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${dark ? 'bg-slate-700/50 text-slate-200' : 'bg-white/70 text-gray-700'}`}>
                        <Shield className="w-4 h-4" />
                        <span className="text-sm font-medium">آمن</span>
                      </div>
                    </div>
                    
                    <div className={`text-center space-y-2 ${dark ? "text-indigo-200" : "text-indigo-800"}`}>
                      <p className="font-semibold text-lg">🔒 تقييمك سري تماماً</p>
                      <p className="text-sm opacity-90">
                        • لن يرى شريك المحادثة تقييمك أبداً<br/>
                        • فقط المنظم يمكنه رؤية التقييمات لتحسين التجربة<br/>
                        • كن صادقاً تماماً - هذا يساعدنا في تطوير النظام
                      </p>
                    </div>
                    
                    <div className={`mt-4 p-3 rounded-lg text-center ${dark ? 'bg-purple-600/20 text-purple-200' : 'bg-purple-100 text-purple-700'}`}>
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-current rounded-full animate-pulse"></div>
                        <span className="text-sm font-bold">صدقك يساعد الجميع</span>
                        <div className="w-2 h-2 bg-current rounded-full animate-pulse"></div>
                      </div>
                      <p className="text-xs opacity-80">تقييماتك الصادقة تساعدنا في تحسين خوارزمية التوافق</p>
                    </div>
                  </motion.div>

                  <motion.h3 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={`text-xl font-bold text-center mb-6 flex items-center justify-center gap-2 ${dark ? "text-slate-200" : "text-gray-800"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${dark ? 'bg-slate-700' : 'bg-gray-200'}`}>
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    تقييم المحادثة
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${dark ? 'bg-slate-700' : 'bg-gray-200'}`}>
                      <Star className="w-4 h-4" />
                    </div>
                  </motion.h3>
                  <div className="space-y-6">
                    {/* Compatibility Rate Slider */}
                    <div className={`p-5 rounded-xl border-2 ${dark ? 'border-slate-600/30 bg-slate-800/20' : 'border-gray-200/50 bg-gray-50/30'}`}>
                      <label className={`block text-base font-bold mb-2 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">⭐</span>
                          <span>خمّن درجة التوافق مع شريك المحادثة</span>
                          <span className="text-red-500">*</span>
                        </div>
                      </label>
                      <p className={`text-sm font-medium mb-4 ${dark ? "text-slate-300" : "text-gray-600"}`}>
                        <span className="flex items-center gap-2">
                          <span className="animate-pulse">👉</span>
                          <span>حرّك المؤشر لتخمين درجة التوافق - سيظهر التقييم الحقيقي بعد الإرسال</span>
                        </span>
                      </p>
                      <div className="relative">
                        <div className="relative group">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={100 - feedbackAnswers.compatibilityRate}
                            onChange={(e) => setFeedbackAnswers(prev => ({ ...prev, compatibilityRate: 100 - parseInt(e.target.value), sliderMoved: true }))}
                            aria-label="درجة التوافق"
                            className="w-full h-2 rounded-full appearance-none cursor-pointer focus:outline-none transition-all duration-300 
                              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 
                              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white 
                              [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 
                              [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-all 
                              [&::-webkit-slider-thumb]:duration-200 hover:[&::-webkit-slider-thumb]:scale-110 
                              hover:[&::-webkit-slider-thumb]:shadow-xl [&::-webkit-slider-thumb]:border-solid
                              [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full 
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
                            } as CSSProperties & { '--thumb-color': string }}
                          />
                          {/* Floating value label */}
                          <div
                            className={`absolute -top-7 px-2 py-0.5 text-xs font-bold rounded-md ${dark ? 'bg-slate-800 text-slate-200 border border-slate-600/60' : 'bg-white text-gray-800 border border-gray-200 shadow'}`}
                            style={{ left: `calc(${feedbackAnswers.compatibilityRate}% - 18px)` }}
                          >
                            {feedbackAnswers.compatibilityRate}%
                          </div>
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
                          <button type="button" onClick={() => setFeedbackAnswers(prev => ({ ...prev, compatibilityRate: 0, sliderMoved: true }))} className={`${dark ? "text-slate-400" : "text-gray-500"} active:scale-95`}>0%</button>
                          <span className={`font-bold text-lg ${
                            feedbackAnswers.compatibilityRate >= 80 ? "text-green-500" :
                            feedbackAnswers.compatibilityRate >= 60 ? "text-yellow-500" :
                            "text-red-500"
                          }`}>
                            {feedbackAnswers.compatibilityRate}%
                          </span>
                          <button type="button" onClick={() => setFeedbackAnswers(prev => ({ ...prev, compatibilityRate: 100, sliderMoved: true }))} className={`${dark ? "text-slate-400" : "text-gray-500"} active:scale-95`}>100%</button>
                        </div>
                      </div>
                    </div>

                                        {/* Conversation Quality Scale */}
                     <div className={`p-4 rounded-xl border ${dark ? 'bg-slate-800/30 border-slate-600/30' : 'bg-gray-50/50 border-gray-200/50'}`}>
                       <label className={`flex items-center gap-2 text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         <div className={`w-6 h-6 rounded-full flex items-center justify-center ${dark ? 'bg-blue-600/20 text-blue-300' : 'bg-blue-100 text-blue-600'}`}>
                           <MessageSquare className="w-3 h-3" />
                         </div>
                         جودة المحادثة 
                         <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = ضعيف جداً، 5 = ممتاز)</span>
                         <div className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-full text-xs ${dark ? 'bg-indigo-600/20 text-indigo-300' : 'bg-indigo-100 text-indigo-600'}`}>
                           <Shield className="w-3 h-3" />
                           <span>مجهول</span>
                         </div>
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
                             <motion.button
                             type="button"
whileHover={{ scale: 1.07 }}
whileTap={{ scale: 0.94 }}
transition={{ type: "spring", stiffness: 500, damping: 30 }}
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
                             </motion.button>
                           )
                         })}
                       </div>
                     </div>

                     {/* Personal Connection Scale */}
                     <div className={`p-4 rounded-xl border ${dark ? 'bg-slate-800/30 border-slate-600/30' : 'bg-gray-50/50 border-gray-200/50'}`}>
                       <label className={`flex items-center gap-2 text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         <div className={`w-6 h-6 rounded-full flex items-center justify-center ${dark ? 'bg-purple-600/20 text-purple-300' : 'bg-purple-100 text-purple-600'}`}>
                           <Heart className="w-3 h-3" />
                         </div>
                         القيم المشتركة 
                         <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = لا يوجد، 5 = قوي جداً)</span>
                         <div className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-full text-xs ${dark ? 'bg-indigo-600/20 text-indigo-300' : 'bg-indigo-100 text-indigo-600'}`}>
                           <Shield className="w-3 h-3" />
                           <span>مجهول</span>
                         </div>
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
                     <div className={`p-4 rounded-xl border ${dark ? 'bg-slate-800/30 border-slate-600/30' : 'bg-gray-50/50 border-gray-200/50'}`}>
                       <label className={`flex items-center gap-2 text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         <div className={`w-6 h-6 rounded-full flex items-center justify-center ${dark ? 'bg-green-600/20 text-green-300' : 'bg-green-100 text-green-600'}`}>
                           <Users className="w-3 h-3" />
                         </div>
                         الاهتمامات المشتركة 
                         <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = لا يوجد، 5 = كثيرة جداً)</span>
                         <div className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-full text-xs ${dark ? 'bg-indigo-600/20 text-indigo-300' : 'bg-indigo-100 text-indigo-600'}`}>
                           <Shield className="w-3 h-3" />
                           <span>مجهول</span>
                         </div>
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
                     <div className={`p-4 rounded-xl border ${dark ? 'bg-slate-800/30 border-slate-600/30' : 'bg-gray-50/50 border-gray-200/50'}`}>
                       <label className={`flex items-center gap-2 text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         <div className={`w-6 h-6 rounded-full flex items-center justify-center ${dark ? 'bg-teal-600/20 text-teal-300' : 'bg-teal-100 text-teal-600'}`}>
                           <Smile className="w-3 h-3" />
                         </div>
                         مستوى الراحة 
                         <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = غير مرتاح، 5 = مرتاح جداً)</span>
                         <div className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-full text-xs ${dark ? 'bg-indigo-600/20 text-indigo-300' : 'bg-indigo-100 text-indigo-600'}`}>
                           <Shield className="w-3 h-3" />
                           <span>مجهول</span>
                         </div>
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
                     <div className={`p-4 rounded-xl border ${dark ? 'bg-slate-800/30 border-slate-600/30' : 'bg-gray-50/50 border-gray-200/50'}`}>
                       <label className={`flex items-center gap-2 text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         <div className={`w-6 h-6 rounded-full flex items-center justify-center ${dark ? 'bg-orange-600/20 text-orange-300' : 'bg-orange-100 text-orange-600'}`}>
                           <Zap className="w-3 h-3" />
                         </div>
                         توافق أسلوب التواصل 
                         <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = مختلف جداً، 5 = متطابق تماماً)</span>
                         <div className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-full text-xs ${dark ? 'bg-indigo-600/20 text-indigo-300' : 'bg-indigo-100 text-indigo-600'}`}>
                           <Shield className="w-3 h-3" />
                           <span>مجهول</span>
                         </div>
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
                     <div className={`p-4 rounded-xl border ${dark ? 'bg-slate-800/30 border-slate-600/30' : 'bg-gray-50/50 border-gray-200/50'}`}>
                       <label className={`flex items-center gap-2 text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         <div className={`w-6 h-6 rounded-full flex items-center justify-center ${dark ? 'bg-pink-600/20 text-pink-300' : 'bg-pink-100 text-pink-600'}`}>
                           <Handshake className="w-3 h-3" />
                         </div>
                         الرغبة في مقابلة مرة أخرى 
                         <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = أبداً، 5 = بالتأكيد)</span>
                         <div className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-full text-xs ${dark ? 'bg-indigo-600/20 text-indigo-300' : 'bg-indigo-100 text-indigo-600'}`}>
                           <Shield className="w-3 h-3" />
                           <span>مجهول</span>
                         </div>
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
                     <div className={`p-4 rounded-xl border ${dark ? 'bg-slate-800/30 border-slate-600/30' : 'bg-gray-50/50 border-gray-200/50'}`}>
                       <label className={`flex items-center gap-2 text-sm font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         <div className={`w-6 h-6 rounded-full flex items-center justify-center ${dark ? 'bg-yellow-600/20 text-yellow-300' : 'bg-yellow-100 text-yellow-600'}`}>
                           <Star className="w-3 h-3" />
                         </div>
                         التقييم العام للتجربة 
                         <span className={`text-xs font-normal opacity-60 ${dark ? "text-slate-400" : "text-gray-500"}`}>(1 = سيء، 5 = ممتاز)</span>
                         <div className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-full text-xs ${dark ? 'bg-indigo-600/20 text-indigo-300' : 'bg-indigo-100 text-indigo-600'}`}>
                           <Shield className="w-3 h-3" />
                           <span>مجهول</span>
                         </div>
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

                  {/* Match Preference (Round 1) - Enhanced */}
                  {(currentRound === 1 || currentRound === 2) && matchResult && matchResult !== 'المنظم' && (
                    <div className={`mt-8 p-6 rounded-xl border-2 ${dark ? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-400/40' : 'bg-gradient-to-r from-purple-50 to-pink-50 border-purple-300/60'}`}>
                      <div className="text-center mb-4">
                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${dark ? 'bg-purple-600/20 text-purple-200' : 'bg-purple-100 text-purple-700'}`}>
                          <Users className="w-5 h-5" />
                          <span className="font-bold text-lg">سؤال مهم!</span>
                        </div>
                      </div>
                      
                      <h3 className={`text-xl font-bold text-center mb-4 ${dark ? "text-purple-200" : "text-purple-800"}`}>
                        هل ترغب في التواصل مع هذا الشخص مرة أخرى؟
                      </h3>
                      
                      <p className={`text-center mb-6 ${dark ? "text-slate-300" : "text-gray-700"}`}>
                        اختيارك سيبقى سرياً حتى يجيب الطرف الآخر أيضاً
                      </p>
                      
                      <div className="flex justify-center gap-6 mb-4">
                        <label className={`flex flex-col items-center gap-3 p-4 rounded-xl cursor-pointer transition-all duration-300 transform hover:scale-105 ${
                          wantMatch === true 
                            ? dark 
                              ? 'bg-emerald-600/30 border-2 border-emerald-400 shadow-lg' 
                              : 'bg-emerald-100 border-2 border-emerald-400 shadow-lg'
                            : dark
                              ? 'bg-slate-700/30 border-2 border-slate-600/30 hover:bg-slate-700/50'
                              : 'bg-white border-2 border-gray-200 hover:bg-gray-50'
                        }`}>
                          <input
                            type="radio"
                            name="wantMatch"
                            checked={wantMatch === true}
                            onChange={() => setWantMatch(true)}
                            className="sr-only"
                          />
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                            wantMatch === true 
                              ? 'bg-emerald-500 text-white' 
                              : dark ? 'bg-slate-600 text-slate-300' : 'bg-gray-200 text-gray-500'
                          }`}>
                            <Handshake className="w-6 h-6" />
                          </div>
                          <span className={`font-bold text-lg ${
                            wantMatch === true 
                              ? dark ? 'text-emerald-200' : 'text-emerald-700'
                              : dark ? 'text-slate-200' : 'text-gray-700'
                          }`}>
                            نعم، أرغب في التواصل
                          </span>
                        </label>
                        
                        <label className={`flex flex-col items-center gap-3 p-4 rounded-xl cursor-pointer transition-all duration-300 transform hover:scale-105 ${
                          wantMatch === false 
                            ? dark 
                              ? 'bg-red-600/30 border-2 border-red-400 shadow-lg' 
                              : 'bg-red-100 border-2 border-red-400 shadow-lg'
                            : dark
                              ? 'bg-slate-700/30 border-2 border-slate-600/30 hover:bg-slate-700/50'
                              : 'bg-white border-2 border-gray-200 hover:bg-gray-50'
                        }`}>
                          <input
                            type="radio"
                            name="wantMatch"
                            checked={wantMatch === false}
                            onChange={() => setWantMatch(false)}
                            className="sr-only"
                          />
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                            wantMatch === false 
                              ? 'bg-red-500 text-white' 
                              : dark ? 'bg-slate-600 text-slate-300' : 'bg-gray-200 text-gray-500'
                          }`}>
                            <X className="w-6 h-6" />
                          </div>
                          <span className={`font-bold text-lg ${
                            wantMatch === false 
                              ? dark ? 'text-red-200' : 'text-red-700'
                              : dark ? 'text-slate-200' : 'text-gray-700'
                          }`}>
                            لا، شكراً
                          </span>
                        </label>
                      </div>
                      
                      <div className={`text-center p-4 rounded-lg ${dark ? 'bg-slate-700/50' : 'bg-blue-50'}`}>
                        <p className={`text-sm font-medium ${dark ? "text-blue-200" : "text-blue-700"}`}>
                          💡 في حال اختار كلاكما "نعم"، سيتم عرض معلومات التواصل لكليكما
                        </p>
                        <p className={`text-xs mt-1 ${dark ? "text-slate-400" : "text-gray-600"}`}>
                          (الاسم، العمر، رقم الهاتف)
                        </p>
                        <div className={`mt-3 p-3 rounded-lg border ${dark ? 'bg-indigo-600/20 border-indigo-400/30' : 'bg-indigo-50 border-indigo-200'}`}>
                          <p className={`text-xs font-medium ${dark ? "text-indigo-200" : "text-indigo-700"}`}>
                            ⏰ يمكنك الوصول للنتائج بعد 30 دقيقة من الصفحة الرئيسية
                          </p>
                          <p className={`text-xs mt-1 ${dark ? "text-indigo-300/80" : "text-indigo-600/80"}`}>
                            في قسم "عرض نتائج التوافق"
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                    {/* Organizer-only general impression (Optional) */}
                    <div className={`mt-6 p-4 rounded-xl border-2 ${dark ? 'bg-gradient-to-r from-pink-900/20 to-rose-900/20 border-pink-400/30' : 'bg-gradient-to-r from-pink-50 to-rose-50 border-pink-200'} shadow-sm`}>
                      <label className={`flex items-center gap-2 text-sm font-bold mb-2 ${dark ? 'text-pink-200' : 'text-rose-700'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${dark ? 'bg-pink-600/20 text-pink-300' : 'bg-pink-100 text-pink-600'}`}>
                          <Shield className="w-3 h-3" />
                        </div>
                        كيف كان شعورك/انطباعك عن الشخص أثناء الفعالية؟ شاركنا أي شيء أعجبك أو ما ارتحت له، لو حاب (اختياري — مخصص للتنظيم وبسرية تامة).
                        <div className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-full text-xs ${dark ? 'bg-pink-600/20 text-pink-200' : 'bg-pink-100 text-pink-700'}`}>
                          <Shield className="w-3 h-3" />
                          <span>سري للتنظيم</span>
                        </div>
                      </label>
                      <textarea
                        value={feedbackAnswers.organizerImpression}
                        onChange={(e) => {
                          const text = e.target.value
                          if (text.length <= 500) {
                            setFeedbackAnswers(prev => ({ ...prev, organizerImpression: text }))
                          }
                        }}
                        placeholder="اكتب ملاحظتك العامة عن الشخص (اختياري — سري للتنظيم)..."
                        rows={3}
                        maxLength={500}
                        className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 resize-none ${
                          dark
                            ? 'border-pink-400/30 bg-white/10 text-white focus:ring-pink-400/20 focus:border-pink-400 placeholder-slate-400'
                            : 'border-pink-300/50 bg-white/90 text-gray-800 focus:ring-pink-300/30 focus:border-pink-500 shadow-sm placeholder-gray-500'
                        }`}
                      />
                      <div className="flex justify-between items-center mt-2">
                        <span className={`text-xs ${dark ? 'text-pink-200/80' : 'text-rose-700/80'}`}>
                          هذه الإجابة لا تُعرض للطرف الآخر
                        </span>
                        <span className={`text-xs ${
                          feedbackAnswers.organizerImpression.length > 450
                            ? 'text-red-500 font-bold'
                            : dark ? 'text-pink-200/80' : 'text-rose-700/80'
                        }`}>
                          {feedbackAnswers.organizerImpression.length}/500
                        </span>
                      </div>
                    </div>

                                         {/* Optional Recommendations */}
                     <div className={`p-4 rounded-xl border ${dark ? 'bg-slate-800/30 border-slate-600/30' : 'bg-gray-50/50 border-gray-200/50'}`}>
                       <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${dark ? "text-slate-200" : "text-gray-700"}`}>
                         <div className={`w-6 h-6 rounded-full flex items-center justify-center ${dark ? 'bg-cyan-600/20 text-cyan-300' : 'bg-cyan-100 text-cyan-600'}`}>
                           <FileText className="w-3 h-3" />
                         </div>
                         توصيات أو نصائح (اختياري)
                         <div className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-full text-xs ${dark ? 'bg-indigo-600/20 text-indigo-300' : 'bg-indigo-100 text-indigo-600'}`}>
                           <Shield className="w-3 h-3" />
                           <span>مجهول</span>
                         </div>
                       </label>
                      <textarea
                        value={feedbackAnswers.recommendations}
                        onChange={(e) => setFeedbackAnswers(prev => ({ ...prev, recommendations: e.target.value }))}
                        placeholder="شاركنا أي توصيات أو نصائح لتحسين أي جزء من الفعالية..."
                        rows={3}
                        className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 resize-none ${
                          dark 
                            ? "border-slate-400/30 bg-white/10 text-white focus:ring-slate-400/30 focus:border-slate-400 placeholder-slate-400" 
                            : "border-blue-400/30 bg-white/90 text-gray-800 focus:ring-blue-400/30 focus:border-blue-500 shadow-sm placeholder-gray-500"
                        }`}
                      />
                    </div>
                  </div>

                  {/* Optional Message to Partner */}
                  <div className={`mt-6 p-4 rounded-xl border ${dark ? 'bg-purple-900/20 border-purple-400/30' : 'bg-purple-50 border-purple-200'}`}>
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <MessageSquare className={`w-4 h-4 ${dark ? 'text-purple-300' : 'text-purple-600'}`} />
                      <span className={`text-sm font-bold ${dark ? 'text-purple-200' : 'text-purple-700'}`}>
                        رسالة اختيارية لشريك المحادثة
                      </span>
                    </div>
                    <p className={`text-xs text-center mb-4 ${dark ? 'text-purple-300/80' : 'text-purple-600/80'}`}>
                      يمكنك إرسال رسالة لطيفة لشريك المحادثة • يرجى التحلي بالاحترام والأدب
                    </p>
                    <textarea
                      value={feedbackAnswers.participantMessage}
                      onChange={(e) => {
                        const message = e.target.value;
                        if (message.length <= 500) {
                          setFeedbackAnswers(prev => ({ ...prev, participantMessage: message }));
                        }
                      }}
                      placeholder="اكتب رسالة لطيفة لشريك المحادثة (اختياري)..."
                      rows={3}
                      maxLength={500}
                      className={`w-full rounded-xl border-2 backdrop-blur-sm p-3 transition-all duration-300 focus:outline-none focus:ring-4 resize-none ${
                        dark 
                          ? "border-purple-400/30 bg-white/10 text-white focus:ring-purple-400/30 focus:border-purple-400 placeholder-slate-400" 
                          : "border-purple-400/30 bg-white/90 text-gray-800 focus:ring-purple-400/30 focus:border-purple-500 shadow-sm placeholder-gray-500"
                      }`}
                    />
                    <div className="flex justify-between items-center mt-2">
                      <span className={`text-xs ${dark ? 'text-purple-300/60' : 'text-purple-600/60'}`}>
                        الرسالة ستظهر في صفحة النتائج
                      </span>
                      <span className={`text-xs ${
                        feedbackAnswers.participantMessage.length > 450 
                          ? 'text-red-500 font-bold' 
                          : dark ? 'text-purple-300/80' : 'text-purple-600/80'
                      }`}>
                        {feedbackAnswers.participantMessage.length}/500
                      </span>
                    </div>
                  </div>

                  {/* Next Event Signup Checkbox - Only show if auto-signup not enabled */}
                  {!autoSignupEnabled && (
                    <div className={`mt-6 p-4 rounded-xl border-2 ${dark ? 'bg-gradient-to-r from-cyan-900/20 to-blue-900/20 border-cyan-400/30' : 'bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-300/50'}`}>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          id="feedback-next-event-signup"
                          checked={feedbackNextEventSignup}
                          onChange={(e) => setFeedbackNextEventSignup(e.target.checked)}
                          className="mt-1 w-4 h-4 rounded border-cyan-400/50 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-0 cursor-pointer"
                        />
                        <label htmlFor="feedback-next-event-signup" className="flex-1 cursor-pointer">
                          <div className={`font-semibold text-sm mb-1 ${dark ? 'text-cyan-200' : 'text-cyan-700'}`}>
                            🎉 سجلني تلقائياً في الفعاليات القادمة
                          </div>
                          <div className={`text-xs ${dark ? 'text-cyan-300/80' : 'text-cyan-600/80'}`}>
                            سنسجلك تلقائياً في كل فعالية قادمة بنفس معلوماتك وتفضيلاتك
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-center gap-3 mt-8">
                     <Button
                       onClick={() => {
                         if (!feedbackAnswers.sliderMoved || feedbackAnswers.compatibilityRate === 50) {
                           toast.error('يرجى تحريك مؤشر التوافق لتخمين الدرجة - لا يمكن أن تكون 50%');
                           return;
                         }
                         submitFeedback();
                       }}
                       className="spring-btn bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105 px-8 py-3 flex items-center gap-3"
                     >
                       <div className="flex items-center gap-2">
                         <Shield className="w-4 h-4" />
                         <Send className="w-4 h-4" />
                       </div>
                       إرسال التقييم المجهول
                     </Button>
                   </div>
              </>
            ) : (
              <>
                {/* Modern Header */}
                <div className="text-center mb-8">
                  <h3 className={`text-2xl font-bold mb-2 bg-gradient-to-r ${dark ? 'from-emerald-400 to-cyan-400' : 'from-emerald-600 to-cyan-600'} bg-clip-text text-transparent`}>
                    شكراً لك!
                  </h3>
                  <p className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
                    إليك نتيجة التوافق الحقيقية من خوارزميتنا
                  </p>
                </div>

                {/* Score Display Card */}
                <div className={`relative overflow-hidden rounded-2xl p-8 mb-6 ${dark ? 'bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-700/50' : 'bg-gradient-to-br from-white to-gray-50 border border-gray-200/50'} shadow-xl backdrop-blur-sm`}>
                  {/* Decorative Background Elements */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-cyan-500/10 to-transparent rounded-full blur-3xl"></div>
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-emerald-500/10 to-transparent rounded-full blur-3xl"></div>
                  
                  <div className="relative z-10">
                    <div className="flex justify-center mb-4">
                      <CircularProgressBar
                        progress={getOriginalScore()}
                        size={200}
                        strokeWidth={22}
                        dark={dark}
                      />
                    </div>
                    
                    <div className={`text-center py-3 px-4 rounded-xl ${dark ? 'bg-blue-500/10 border border-blue-400/20' : 'bg-blue-50/80 border border-blue-200/50'}`}>
                      <div className="flex items-center justify-center gap-2">
                        <Info className={`w-4 h-4 ${dark ? 'text-blue-300' : 'text-blue-600'}`} />
                        <p className={`text-xs font-medium ${dark ? 'text-blue-300' : 'text-blue-700'}`}>
                          النتيجة من خوارزمية التوافق (وليست التقييمات التي أعطيتماها لبعضكما)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Compatibility breakdown section */}
                <div>
                      {isScoreRevealed && (
                        <div className="mt-6 space-y-4">
                          {/* Anchor to allow auto-scroll to the analysis section */}
                          <div ref={compatibilityRef} data-anchor="compatibility-analysis" className="h-0" />
                          {/* Compatibility Analysis Section */}
                          {(() => {
                            const formattedReason = formatCompatibilityReason(matchReason)
                            const m = formattedReason.metrics
                            const percent = (v: number, max: number) => Math.max(0, Math.min(100, Math.round((v / max) * 100)))
                            const dims = [
                              { key: 'vibe', label: 'الطاقة والكيمياء', value: m.vibe, max: 20, bar: 'from-purple-500 to-pink-500' },
                              { key: 'lifestyle', label: 'نمط الحياة', value: m.lifestyle, max: 15, bar: 'from-cyan-500 to-blue-500' },
                              { key: 'humorOpen', label: 'الدعابة/الانفتاح', value: m.humorOpen, max: 15, bar: 'from-amber-500 to-orange-500' },
                              { key: 'communication', label: 'التواصل', value: m.communication, max: 10, bar: 'from-indigo-500 to-sky-500' },
                              { key: 'intentValues', label: 'الأهداف/القيم', value: m.intentValues, max: 5, bar: 'from-emerald-500 to-teal-500' },
                            ]
                            const sorted = [...dims].sort((a, b) => percent(b.value, b.max) - percent(a.value, a.max))
                            const topStrengths = sorted.filter(d => percent(d.value, d.max) >= 60).slice(0, 2)
                            const growth = sorted.filter(d => percent(d.value, d.max) < 40).slice(0, 2)
                            
                            // Fallback: if no components parsed (old/group/organizer reasons), show a concise message
                            if (!m?.newModel && formattedReason.components.length === 0) {
                              return (
                                <div className={`rounded-xl p-4 ${dark ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-gray-200/50'}`}>
                                  <h4 className={`font-semibold text-sm mb-2 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>تحليل التوافق</h4>
                                  <p className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
                                    {formattedReason.originalReason || 'لا توجد تفاصيل تحليل متوفرة لهذا اللقاء حالياً.'}
                                  </p>
                                </div>
                              )
                            }
                            return (
                              <div className={`rounded-2xl overflow-hidden ${dark ? 'bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50' : 'bg-gradient-to-br from-white to-gray-50/80 border border-gray-200/50'} shadow-lg`}>
                                {/* Header */}
                                <div className={`px-6 py-4 border-b ${dark ? 'bg-slate-800/80 border-slate-700/50' : 'bg-gradient-to-r from-gray-50 to-white border-gray-200/50'}`}>
                                  <h4 className={`text-xl font-bold flex items-center gap-2 ${dark ? 'text-slate-100' : 'text-gray-900'}`}>
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    تحليل التوافق
                                  </h4>
                                  <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
                                    تفصيل دقيق لمستويات التوافق بينكما
                                  </p>
                                </div>

                                {/* Synergy Overview (New Model) */}
                                {m?.newModel && (
                                  <div className={`px-6 pt-5 ${dark ? '' : ''}`}>
                                    <div className={`rounded-xl p-4 ${dark ? 'bg-slate-900/30 border border-slate-700/40' : 'bg-white/70 border border-gray-200/70'} `}>
                                      <div className="flex items-center justify-between mb-2">
                                        <span className={`text-sm font-bold ${dark ? 'text-slate-100' : 'text-gray-900'}`}>مؤشر الانسجام العام</span>
                                        <span className={`text-sm font-extrabold ${m.synergyPercent >= 70 ? 'text-emerald-400' : m.synergyPercent >= 50 ? 'text-yellow-500' : 'text-orange-500'}`}>{m.synergyPercent}%</span>
                                      </div>
                                      <div className={`w-full h-2.5 rounded-full ${dark ? 'bg-slate-700/70' : 'bg-gray-200'}`}>
                                        <div
                                          className={`h-full rounded-full bg-gradient-to-r ${m.synergyPercent >= 70 ? 'from-emerald-500 to-teal-500' : m.synergyPercent >= 50 ? 'from-amber-500 to-yellow-500' : 'from-orange-500 to-red-500'}`}
                                          style={{ width: `${m.synergyPercent}%` }}
                                        />
                                      </div>

                                      {/* Dimension mini-bars */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                                        {dims.map((d, i) => (
                                          <div key={i} className={`rounded-lg p-3 ${dark ? 'bg-slate-800/40 border border-slate-700/40' : 'bg-white/70 border border-gray-200/70'}`}>
                                            <div className="flex items-center justify-between mb-1">
                                              <span className={`text-xs font-semibold ${dark ? 'text-slate-200' : 'text-gray-800'}`}>{d.label}</span>
                                              <span className={`text-xs font-bold ${dark ? 'text-slate-300' : 'text-gray-700'}`}>{percent(d.value, d.max)}%</span>
                                            </div>
                                            <div className={`w-full h-1.5 rounded-full ${dark ? 'bg-slate-700/70' : 'bg-gray-200'}`}>
                                              <div
                                                className={`h-full rounded-full bg-gradient-to-r ${d.bar}`}
                                                style={{ width: `${percent(d.value, d.max)}%` }}
                                              />
                                            </div>
                                          </div>
                                        ))}
                                      </div>

                                      {/* Highlights & Tips */}
                                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
                                        {topStrengths.length > 0 && (
                                          <div className={`${dark ? 'bg-emerald-500/10 border border-emerald-400/30' : 'bg-emerald-50 border border-emerald-200'} rounded-lg p-3`}>
                                            <div className={`text-xs font-bold mb-1 ${dark ? 'text-emerald-300' : 'text-emerald-700'}`}>أبرز النقاط</div>
                                            <ul className={`text-xs leading-relaxed ${dark ? 'text-emerald-100' : 'text-emerald-800'} list-disc pr-4`}> 
                                              {topStrengths.map((d, idx) => (
                                                <li key={idx}>{d.label}: جانب قويّ يساعد على سهولة الانسجام.</li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                        {growth.length > 0 && (
                                          <div className={`${dark ? 'bg-amber-500/10 border border-amber-400/30' : 'bg-amber-50 border border-amber-200'} rounded-lg p-3`}>
                                            <div className={`text-xs font-bold mb-1 ${dark ? 'text-amber-300' : 'text-amber-700'}`}>نقاط تحتاج رعاية</div>
                                            <ul className={`text-xs leading-relaxed ${dark ? 'text-amber-100' : 'text-amber-800'} list-disc pr-4`}>
                                              {growth.map((d, idx) => (
                                                <li key={idx}>{d.label}: خذا دقائق إضافية للتوضيح، وابدآ بأسئلة بسيطة وشفافة.</li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Compatibility Cards */}
                                <div className="p-6 space-y-3">
                                  {formattedReason.components.map((component: { name: string; strength: string; color: string; bgColor: string; borderColor: string; description: string }, index: number) => (
                                    <div 
                                      key={index}
                                      className={`group relative overflow-hidden rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] ${dark ? 'bg-slate-800/60 border border-slate-700/40 hover:border-slate-600/60' : 'bg-white border border-gray-200/60 hover:border-gray-300/80'} shadow-sm hover:shadow-md`}
                                    >
                                      {/* Accent Bar */}
                                      <div className={`absolute right-0 top-0 bottom-0 w-1 ${component.bgColor} opacity-60 group-hover:opacity-100 transition-opacity`}></div>
                                      
                                      <div className="flex items-start justify-between gap-3 mb-2">
                                        <span className={`text-base font-bold ${dark ? 'text-slate-100' : 'text-gray-900'}`}>
                                          {component.name}
                                        </span>
                                        <span className={`flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${component.color} ${component.bgColor} shadow-sm border ${component.borderColor}`}>
                                          {component.strength}
                                        </span>
                                      </div>
                                      <p className={`text-sm leading-relaxed ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                                        {component.description}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })()}
                          
                          {/* AI Vibe Analysis Button and Display */}
                          {matchResult && matchResult !== 'المنظم' && (
                            <div className={`rounded-2xl overflow-hidden ${dark ? 'bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50' : 'bg-gradient-to-br from-white to-gray-50/80 border border-gray-200/50'} shadow-lg`}>
                              {!showAiAnalysis ? (
                                <div className="p-8 text-center">
                                  <div className="flex justify-center mb-4">
                                    <div className={`p-4 rounded-2xl ${dark ? 'bg-purple-500/20' : 'bg-purple-100/80'}`}>
                                      <Sparkles className={`w-10 h-10 ${dark ? 'text-purple-400' : 'text-purple-600'}`} />
                                    </div>
                                  </div>
                                  <h4 className={`text-xl font-bold mb-2 ${dark ? 'text-slate-100' : 'text-gray-900'}`}>
                                    اكتشف سبب توافقكما الرائع!
                                  </h4>
                                  <p className={`text-sm mb-6 ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
                                    تحليل ذكي لاهتماماتكما المشتركة وأسلوبكما في الحياة
                                  </p>
                                  <Button
                                    onClick={generateVibeAnalysis}
                                    disabled={isGeneratingAnalysis}
                                    className={`bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 ${
                                      isGeneratingAnalysis ? 'opacity-75 cursor-not-allowed' : ''
                                    }`}
                                  >
                                    {isGeneratingAnalysis ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin ml-2"></div>
                                        جاري التحليل...
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles className="w-4 h-4 ml-2" />
                                        عرض التحليل الذكي
                                      </>
                                    )}
                                  </Button>
                                </div>
                              ) : (
                                <div>
                                  <div className={`px-6 py-4 border-b ${dark ? 'bg-slate-800/80 border-slate-700/50' : 'bg-gradient-to-r from-purple-50 to-pink-50 border-gray-200/50'}`}>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Sparkles className={`w-6 h-6 ${dark ? 'text-purple-400' : 'text-purple-600'}`} />
                                        <h4 className={`text-xl font-bold ${dark ? 'text-slate-100' : 'text-gray-900'}`}>
                                          لماذا تتوافقان بشكل رائع؟
                                        </h4>
                                      </div>
                                      <Button
                                        onClick={() => setShowAiAnalysis(false)}
                                        variant="ghost"
                                        size="sm"
                                        className={`${dark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-600 hover:text-gray-900'}`}
                                      >
                                        <X className="w-5 h-5" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="p-6">
                                    <div className={`text-sm leading-relaxed whitespace-pre-wrap ${dark ? 'text-slate-300' : 'text-gray-800'}`}>
                                      {displayedAnalysis}
                                      {isAnalysisTyping && (
                                        <span className="inline-block w-0.5 h-4 bg-current ml-1 animate-pulse"></span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
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
                        {(currentRound === 1 || currentRound === 2) && (
                          <div className={`rounded-2xl overflow-hidden ${dark ? 'bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border border-cyan-700/50' : 'bg-gradient-to-br from-cyan-50 to-blue-50 border border-cyan-200/50'} shadow-lg`}>
                            <div className="p-8 text-center">
                              <div className="flex justify-center mb-6">
                                <div className={`relative p-6 rounded-2xl ${dark ? 'bg-cyan-500/20' : 'bg-cyan-100/80'} shadow-xl`}>
                                  <Clock className={`w-16 h-16 ${dark ? 'text-cyan-400' : 'text-cyan-600'} animate-spin-slow`} />
                                  <div className={`absolute inset-0 rounded-2xl ${dark ? 'border-2 border-cyan-400/30' : 'border-2 border-cyan-300/40'} animate-pulse`}></div>
                                </div>
                              </div>
                              <h2 className={`text-3xl font-bold mb-4 bg-gradient-to-r ${dark ? 'from-cyan-400 to-blue-400' : 'from-cyan-600 to-blue-600'} bg-clip-text text-transparent`}>
                                انتهت الجولة
                              </h2>
                              <div className={`max-w-md mx-auto p-4 rounded-xl ${dark ? 'bg-blue-500/10 border border-blue-400/20' : 'bg-blue-50/80 border border-blue-200/50'}`}>
                                <div className="flex items-start gap-3">
                                  <Info className={`w-5 h-5 flex-shrink-0 mt-0.5 ${dark ? 'text-blue-400' : 'text-blue-600'}`} />
                                  <p className={`text-sm leading-relaxed ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                                    تحقق في الصفحة الرئيسية بعد نصف ساعة إلى ساعة لمعرفة ما إذا كان هناك توافق متبادل
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Only show buttons if NOT waiting for host */}
                  {!((currentRound === 1 || currentRound === 2) && isScoreRevealed) && (
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
          </>
        )}

      </div>

      {/* Form filled prompt modal */}
      {showFormFilledPrompt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`w-full max-w-md rounded-2xl p-8 shadow-2xl border-2 ${dark ? "bg-slate-800 border-slate-600" : "bg-white border-gray-200"}`} dir="rtl">
            <h3 className={`text-xl font-bold text-center mb-4 ${dark ? "text-slate-100" : "text-gray-800"}`}>لقد قمت بتعبئة النموذج مسبقاً</h3>
            <p className={`text-center mb-6 ${dark ? "text-slate-300" : "text-gray-600"}`}>هل ترغب في إعادة تعبئة النموذج أم الانتقال مباشرةً إلى الإنتظار؟</p>
            <div className="flex gap-4 justify-center">
              <Button
                className="px-6 py-2 font-bold"
                onClick={async () => {
                  setShowFormFilledPrompt(false);
                  setFormFilledChoiceMade(true);
                  setStep(2); // Stay on form
                  setAnalysisStarted(false);
                  
                  // First, load existing survey data if not already loaded
                  if (!hasSubstantialSurveyData(surveyData.answers)) {
                    try {
                      const tokenToUse = token || secureToken;
                      console.log("🔍 Redo Form - Using token:", tokenToUse);
                      const userRes = await fetch("/api/participant", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "resolve-token", secure_token: tokenToUse }),
                      });
                      const userData = await userRes.json();
                      console.log("🔍 Redo Form - userData received:", userData);
                      if (userData.success && userData.survey_data) {
                        console.log("🔍 Redo Form - survey_data exists:", userData.survey_data);
                        
                        // Set assigned number if available
                        if (userData.assigned_number && !assignedNumber) {
                          setAssignedNumber(userData.assigned_number);
                          console.log("🔍 Redo Form - Set assigned number:", userData.assigned_number);
                        }
                        
                        // Set participant name if available
                        if (userData.name && !participantName) {
                          setParticipantName(userData.name);
                          console.log("🔍 Redo Form - Set participant name:", userData.name);
                        }
                        
                        // Ensure the survey_data has the expected structure
                        const formattedSurveyData = {
                          answers: userData.survey_data.answers || {},
                          termsAccepted: userData.survey_data.termsAccepted || false,
                          dataConsent: userData.survey_data.dataConsent || false,
                          ...userData.survey_data
                        };
                        setSurveyData(formattedSurveyData);
                      }
                    } catch (err) {
                      console.error("Failed to load existing survey data:", err);
                    }
                  }
                  
                  setShowSurvey(true); // Show survey for redo
                  // Delay setting editing flag to allow data to load first
                  setTimeout(() => {
                    console.log("🔍 Redo Form - Current surveyData before editing:", surveyData);
                    setIsEditingSurvey(true);
                  }, 100);
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
                الانتقال إلى الإنتظار
              </Button>
            </div>
          </div>
        </div>
      )}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`max-w-lg w-auto mx-4 rounded-2xl p-8 shadow-2xl border-2 ${dark ? "bg-slate-800 border-slate-600" : "bg-white border-gray-200"}`} dir="rtl">
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-xl font-bold ${dark ? "text-slate-100" : "text-gray-800"}`}>سجل اللقاءات السابقة</h3>
              <Button variant="ghost" onClick={() => setShowHistory(false)}><X /></Button>
            </div>
            <div className="divide-y divide-gray-300/30 max-h-96 overflow-y-auto custom-scrollbar">
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
                      {m.mutual_match && (
                        <span className={`text-xs px-2 py-1 rounded ${dark ? "bg-emerald-700/70 text-emerald-200" : "bg-emerald-100 text-emerald-700"}`}>
                          <Handshake className="w-3 h-3 inline mr-1" />
                          مطابقة
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
                        {m.mutual_match && (
                          <span className={`text-xs px-1 py-1 rounded-full ${
                            dark 
                              ? "bg-emerald-700/70 text-emerald-200" 
                              : "bg-emerald-100 text-emerald-700"
                          }`}>
                            <Handshake className="w-2 h-2 inline" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`font-bold text-sm ${
                          (m.with && typeof m.with === 'string' && m.with.includes("،") ? (m.score || 0) * 10 : (m.score || 0)) >= 70 ? "text-green-500" :
                          (m.with && typeof m.with === 'string' && m.with.includes("،") ? (m.score || 0) * 10 : (m.score || 0)) >= 50 ? "text-yellow-500" :
                          (m.with && typeof m.with === 'string' && m.with.includes("،") ? (m.score || 0) * 10 : (m.score || 0)) >= 30 ? "text-orange-500" :
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
          <div className={`max-w-md w-full sm:max-w-lg mx-2 sm:mx-4 rounded-2xl p-4 sm:p-8 shadow-2xl border-2 ${dark ? "bg-slate-800/80 border-slate-600" : "bg-white/80 border-gray-200"} max-h-[90vh] overflow-y-auto custom-scrollbar`} dir="rtl">
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
                  <ParticipantBadge size="default" showStatus={false} />
                  <div className={`text-3xl ${dark ? "text-slate-300" : "text-gray-500"}`}>×</div>
                  <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 ${
                    dark 
                      ? "bg-gradient-to-br from-slate-700 via-slate-600 to-slate-800 border-slate-400/50 text-white shadow-slate-900/50" 
                      : "bg-gradient-to-br from-white via-gray-50 to-gray-100 border-gray-300 text-gray-800 shadow-gray-500/30"
                  }`}>
                    <span className="text-2xl font-bold tracking-wider drop-shadow-sm">
                      {selectedHistoryItem.with === "المنظم" ? "المنظم" : `#${selectedHistoryItem.with}`}
                    </span>
                    {/* Inner glow effect */}
                    <div className={`
                      absolute inset-0 rounded-full opacity-20
                      ${dark 
                        ? "bg-gradient-to-br from-cyan-400 to-blue-500" 
                        : "bg-gradient-to-br from-blue-400 to-cyan-500"
                      }
                    `}></div>
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
                  {(() => {
                    // Calculate original score (remove bonus)
                    const scoreWithBonus = selectedHistoryItem.score || 0
                    const bonus = selectedHistoryItem.humor_early_openness_bonus
                    const multiplier = bonus === 'full' ? 1.15 : bonus === 'partial' ? 1.05 : 1
                    const originalScore = bonus && bonus !== 'none' ? Math.round(scoreWithBonus / multiplier) : scoreWithBonus
                    return selectedHistoryItem.with && typeof selectedHistoryItem.with === 'string' && selectedHistoryItem.with.includes("،") ? `${Math.round(originalScore * 10)}%` : `${originalScore}%`
                  })()}
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
                    {(() => {
                      // Calculate original score (remove bonus)
                      const scoreWithBonus = selectedHistoryItem.score || 0
                      const bonus = selectedHistoryItem.humor_early_openness_bonus
                      const multiplier = bonus === 'full' ? 1.15 : bonus === 'partial' ? 1.05 : 1
                      const originalScore = bonus && bonus !== 'none' ? Math.round(scoreWithBonus / multiplier) : scoreWithBonus
                      return selectedHistoryItem.with && typeof selectedHistoryItem.with === 'string' && selectedHistoryItem.with.includes("،") ? `${Math.round(originalScore * 10)}%` : `${originalScore}%`
                    })()}
                  </span>
                </div>
                <div className={`w-full h-3 rounded-full ${dark ? "bg-slate-600" : "bg-gray-200"}`}>
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${(() => {
                      // Calculate original score (remove bonus)
                      const scoreWithBonus = selectedHistoryItem.score || 0
                      const bonus = selectedHistoryItem.humor_early_openness_bonus
                      const multiplier = bonus === 'full' ? 1.15 : bonus === 'partial' ? 1.05 : 1
                      const originalScore = bonus && bonus !== 'none' ? Math.round(scoreWithBonus / multiplier) : scoreWithBonus
                      const displayScore = selectedHistoryItem.with && typeof selectedHistoryItem.with === 'string' && selectedHistoryItem.with.includes("،") ? originalScore * 10 : originalScore
                      return displayScore >= 70 ? "bg-green-500" : displayScore >= 50 ? "bg-yellow-500" : displayScore >= 30 ? "bg-orange-500" : "bg-red-500"
                    })()}`}
                    style={{ width: `${(() => {
                      // Calculate original score (remove bonus)
                      const scoreWithBonus = selectedHistoryItem.score || 0
                      const bonus = selectedHistoryItem.humor_early_openness_bonus
                      const multiplier = bonus === 'full' ? 1.15 : bonus === 'partial' ? 1.05 : 1
                      const originalScore = bonus && bonus !== 'none' ? Math.round(scoreWithBonus / multiplier) : scoreWithBonus
                      return selectedHistoryItem.with && typeof selectedHistoryItem.with === 'string' && selectedHistoryItem.with.includes("،") ? originalScore * 10 : originalScore
                    })()}%` }}
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
      {showPromptTopicsModal && (
        <Suspense fallback={null}>
          <PromptTopicsModal open={showPromptTopicsModal} onClose={() => setShowPromptTopicsModal(false)} />
        </Suspense>
      )}

      {/* Returning Participant Signup Popup */}
      <Dialog open={showReturningSignupPopup} onOpenChange={setShowReturningSignupPopup}>
        <DialogContent className={`max-w-md ${dark ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`} dir="rtl">
          <DialogHeader>
            <DialogTitle className={`text-xl font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
              تسجيل مشارك سابق
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
              مرحباً بعودتك! يرجى تحديث تفضيلاتك للحدث القادم
            </p>

            <div className="space-y-4">
              {/* Gender Preference - Always show */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${dark ? 'text-slate-200' : 'text-gray-700'}`}>
                  تفضيل الجنس للمطابقة
                </label>
                <RadioGroup value={returningGenderPreference} onValueChange={setReturningGenderPreference}>
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <RadioGroupItem value="opposite_gender" id="opposite" />
                    <Label htmlFor="opposite" className={dark ? 'text-slate-300' : 'text-gray-600'}>الجنس المقابل (افتراضي)</Label>
                  </div>
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <RadioGroupItem value="same_gender" id="same" />
                    <Label htmlFor="same" className={dark ? 'text-slate-300' : 'text-gray-600'}>نفس الجنس فقط</Label>
                  </div>
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <RadioGroupItem value="any_gender" id="any" />
                    <Label htmlFor="any" className={dark ? 'text-slate-300' : 'text-gray-600'}>أي جنس</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Show other questions only if they haven't been filled in database */}
              {(!participantHasHumorStyle || !participantHasOpennessComfort) && (
                <>
                  {/* Humor/Banter Style */}
                  {!participantHasHumorStyle && (
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${dark ? 'text-slate-200' : 'text-gray-700'}`}>
                        أسلوب الدعابة والمزاح
                      </label>
                      <Select value={returningHumorStyle} onValueChange={setReturningHumorStyle}>
                        <SelectTrigger className={dark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'}>
                          <SelectValue placeholder="اختر أسلوبك" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">مرح وخفيف الظل</SelectItem>
                          <SelectItem value="B">ساخر ومتفهم</SelectItem>
                          <SelectItem value="C">جدي مع لمسة مرح</SelectItem>
                          <SelectItem value="D">هادئ ومتحفظ</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Early Openness Comfort */}
                  {!participantHasOpennessComfort && (
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${dark ? 'text-slate-200' : 'text-gray-700'}`}>
                        مستوى الراحة في الانفتاح المبكر
                      </label>
                      <RadioGroup value={returningOpennessComfort} onValueChange={setReturningOpennessComfort}>
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <RadioGroupItem value="0" id="comfort0" />
                          <Label htmlFor="comfort0" className={dark ? 'text-slate-300' : 'text-gray-600'}>محادثات سطحية وخفيفة</Label>
                        </div>
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <RadioGroupItem value="1" id="comfort1" />
                          <Label htmlFor="comfort1" className={dark ? 'text-slate-300' : 'text-gray-600'}>مشاركة بعض التفاصيل الشخصية</Label>
                        </div>
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <RadioGroupItem value="2" id="comfort2" />
                          <Label htmlFor="comfort2" className={dark ? 'text-slate-300' : 'text-gray-600'}>انفتاح متوسط</Label>
                        </div>
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <RadioGroupItem value="3" id="comfort3" />
                          <Label htmlFor="comfort3" className={dark ? 'text-slate-300' : 'text-gray-600'}>انفتاح كامل ومحادثات عميقة</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                onClick={() => setShowReturningSignupPopup(false)}
                variant="outline"
                className="flex-1"
              >
                إلغاء
              </Button>
              <Button 
                onClick={handleReturningSignupSubmit}
                disabled={returningLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {returningLoading ? "جاري التسجيل..." : "تسجيل للحدث القادم"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Next Event Signup Popup */}
      <Dialog open={showNextEventPopup} onOpenChange={setShowNextEventPopup}>
        <DialogContent className={`max-w-md ${dark ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`} dir="rtl">
          <DialogHeader>
            <DialogTitle className={`text-xl font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
              التسجيل للحدث القادم
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {participantInfo && (
              <p className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
                مرحباً {participantInfo.name} (#{participantInfo.assigned_number})! هل تود التسجيل للحدث القادم؟
              </p>
            )}

            <div className="space-y-4">
              {/* Gender Preference - Always show */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${dark ? 'text-slate-200' : 'text-gray-700'}`}>
                  تفضيل الجنس للمطابقة
                </label>
                <RadioGroup value={returningGenderPreference} onValueChange={setReturningGenderPreference}>
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <RadioGroupItem value="opposite_gender" id="next_opposite" />
                    <Label htmlFor="next_opposite" className={dark ? 'text-slate-300' : 'text-gray-600'}>الجنس المقابل (افتراضي)</Label>
                  </div>
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <RadioGroupItem value="same_gender" id="next_same" />
                    <Label htmlFor="next_same" className={dark ? 'text-slate-300' : 'text-gray-600'}>نفس الجنس فقط</Label>
                  </div>
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <RadioGroupItem value="any_gender" id="next_any" />
                    <Label htmlFor="next_any" className={dark ? 'text-slate-300' : 'text-gray-600'}>أي جنس</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Show other questions only if they haven't been filled in database */}
              {(!participantHasHumorStyle || !participantHasOpennessComfort) && (
                <>
                  {/* Humor/Banter Style */}
                  {!participantHasHumorStyle && (
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${dark ? 'text-slate-200' : 'text-gray-700'}`}>
                        أسلوب الدعابة والمزاح
                      </label>
                      <Select value={returningHumorStyle} onValueChange={setReturningHumorStyle}>
                        <SelectTrigger className={dark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'}>
                          <SelectValue placeholder="اختر أسلوبك" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">مرح وخفيف الظل</SelectItem>
                          <SelectItem value="B">ساخر ومتفهم</SelectItem>
                          <SelectItem value="C">جدي مع لمسة مرح</SelectItem>
                          <SelectItem value="D">هادئ ومتحفظ</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Early Openness Comfort */}
                  {!participantHasOpennessComfort && (
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${dark ? 'text-slate-200' : 'text-gray-700'}`}>
                        مستوى الراحة في الانفتاح المبكر
                      </label>
                      <RadioGroup value={returningOpennessComfort} onValueChange={setReturningOpennessComfort}>
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <RadioGroupItem value="0" id="next_comfort0" />
                          <Label htmlFor="next_comfort0" className={dark ? 'text-slate-300' : 'text-gray-600'}>محادثات سطحية وخفيفة</Label>
                        </div>
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <RadioGroupItem value="1" id="next_comfort1" />
                          <Label htmlFor="next_comfort1" className={dark ? 'text-slate-300' : 'text-gray-600'}>مشاركة بعض التفاصيل الشخصية</Label>
                        </div>
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <RadioGroupItem value="2" id="next_comfort2" />
                          <Label htmlFor="next_comfort2" className={dark ? 'text-slate-300' : 'text-gray-600'}>انفتاح متوسط</Label>
                        </div>
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <RadioGroupItem value="3" id="next_comfort3" />
                          <Label htmlFor="next_comfort3" className={dark ? 'text-slate-300' : 'text-gray-600'}>انفتاح كامل ومحادثات عميقة</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  )}
                </>
              )}

              {/* Auto Signup Checkbox */}
              <div className={`p-4 rounded-xl border ${dark ? "bg-cyan-500/10 border-cyan-400/30" : "bg-cyan-50 border-cyan-200"}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="auto-signup-dialog-popup"
                    checked={autoSignupNextEvent}
                    onChange={(e) => setAutoSignupNextEvent(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-cyan-400/50 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-0 cursor-pointer"
                  />
                  <div className="flex-1">
                    <Label htmlFor="auto-signup-dialog-popup" className={`text-sm font-medium cursor-pointer ${dark ? "text-cyan-300" : "text-cyan-700"}`}>
                      ✨ سجلني تلقائياً في جميع الأحداث القادمة
                    </Label>
                    <p className={`text-xs mt-1 ${dark ? "text-cyan-200" : "text-cyan-600"}`}>
                      لن تحتاج للتسجيل يدوياً في كل حدث - سيتم تسجيلك تلقائياً
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                onClick={() => {
                  setShowNextEventPopup(false)
                  setAutoSignupNextEvent(false)
                }}
                variant="outline"
                className="flex-1"
              >
                لاحقاً
              </Button>
              <Button 
                onClick={handleAutoSignupNextEvent}
                disabled={nextEventSignupLoading}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {nextEventSignupLoading ? "جاري التسجيل..." : "نعم، سجلني"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      </div>

      {/* React Hot Toast Container */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--toast-bg)',
            color: 'var(--toast-color)',
            border: '1px solid var(--toast-border)',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '500',
            padding: '12px 16px',
            maxWidth: '400px',
            direction: 'rtl',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#ffffff',
            },
          },
        }}
      />
      
    </>
  )
}

