// Type definitions for Welcome page
export interface SurveyData {
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

export interface MatchResultEntry {
  with: number | string
  partner_name?: string
  partner_age?: number | null
  partner_phone?: string | null
  partner_event_id?: number | null
  type: string
  reason: string
  round: number
  table_number?: number | null
  score: number
  is_repeat_match?: boolean
  mutual_match?: boolean
  wants_match?: boolean | null
  partner_wants_match?: boolean | null
  created_at?: string
  ai_personality_analysis?: string | null
  event_id?: number
  partner_message?: string | null
  humor_early_openness_bonus?: 'full' | 'partial' | 'none'
}

export interface FeedbackAnswers {
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
  participantMessage: string
}

export interface AnnouncementData {
  message: string
  type: string
  time: string
}

export type Phase = "registration" | "form" | "waiting" | "round_1" | null

export type ModalStep = null | "feedback" | "result"

export interface ParticipantState {
  assignedNumber: number | null
  participantName: string | null
  secureToken: string | null
  tableNumber: number | null
  phase: Phase
  currentRound: number
}

export interface TimerState {
  conversationStarted: boolean
  conversationTimer: number
  globalTimerActive: boolean
  globalTimerStartTime: string | null
  globalTimerDuration: number
  round1LocalTimer: number
  timerRestored: boolean
  timerRestoreAttempted: boolean
}

export interface UIState {
  step: number
  dark: boolean
  loading: boolean
  showTokenModal: boolean
  showSurvey: boolean
  isEditingSurvey: boolean
  showHistory: boolean
  showHistoryDetail: boolean
  showFormFilledPrompt: boolean
  showNewUserTypePopup: boolean
  showFAQPopup: boolean
  animationStep: number
  showRegistrationContent: boolean
}

export interface MatchState {
  matchResult: string | null
  matchReason: string
  isRepeatMatch: boolean
  compatibilityScore: number | null
  humorBonus: 'full' | 'partial' | 'none'
  isScoreRevealed: boolean
  aiAnalysis: string | null
  isGeneratingAnalysis: boolean
  showAiAnalysis: boolean
}
