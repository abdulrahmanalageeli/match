export interface Participant {
  id: string
  assigned_number: number
  table_number?: number
  survey_data?: {
    answers: Record<string, string | string[]>
    termsAccepted: boolean
    dataConsent: boolean
    mbtiType?: string
    attachmentStyle?: string
    communicationStyle?: string
  }
  mbti_personality_type?: string
  attachment_style?: string
  communication_style?: string
  summary?: string
  secure_token: string
  match_id: string
  is_host?: boolean
  created_at?: string
  updated_at?: string
}

export interface MatchResult {
  id: string
  participant_a_number: number
  participant_b_number: number
  compatibility_score: number
  reason: string
  match_id: string
  round: number
  table_number?: number
  match_type?: string
  conversation_start_time?: string
  conversation_duration?: number
  conversation_status?: 'pending' | 'active' | 'finished'
}

export interface GroupMatch {
  id: string
  group_id: string
  participant_numbers: number[]
  compatibility_score: number
  reason: string
  match_id: string
  table_number?: number
  conversation_start_time?: string
  conversation_duration?: number
  conversation_status?: 'pending' | 'active' | 'finished'
}

export interface EventState {
  match_id: string
  phase: 'registration' | 'form' | 'waiting' | 'round_1' | 'waiting_2' | 'round_2' | 'waiting_3' | 'round_3' | 'waiting_4' | 'round_4' | 'group_phase'
  announcement?: string
  announcement_type?: 'info' | 'warning' | 'error' | 'success'
  announcement_time?: string
  emergency_paused?: boolean
  pause_time?: string
  current_round?: number
  total_rounds?: number
}

export interface ApiResponse<T> {
  data?: T
  error?: string
  success?: boolean
}

export interface AdminCredentials {
  password: string
}

export interface TokenRequest {
  action: 'create' | 'resolve'
  assigned_number?: number
  secure_token?: string
}

export interface SaveParticipantRequest {
  assigned_number: number
  survey_data?: {
    answers: Record<string, string | string[]>
    termsAccepted: boolean
    dataConsent: boolean
    mbtiType?: string
    attachmentStyle?: string
    communicationStyle?: string
  }
  summary?: string
  feedback?: any
  round?: number
}

export interface GenerateSummaryRequest {
  responses: {
    q1: string
    q2: string
    q3: string
    q4: string
  }
}

export interface GetMatchesRequest {
  assigned_number: number
  round?: number
}

export interface MatchResultEntry {
  with: string
  type: string
  reason: string
  round: number
  table_number: number | null
  score: number
}

export interface GroupMatchEntry {
  group_id: string
  participants: string[]
  reason: string
  table_number: number | null
  score: number
}

export type Phase = 'registration' | 'form' | 'waiting' | 'round_1' | 'waiting_2' | 'round_2' | 'waiting_3' | 'round_3' | 'waiting_4' | 'round_4' | 'group_phase'

export interface PhaseConfig {
  label: string
  color: string
  bg: string
  icon: React.ComponentType<{ className?: string }>
}

export interface ParticipantStats {
  total_participants: number
  form_completed: number
  waiting_count: number
  current_round_participants: number
} 