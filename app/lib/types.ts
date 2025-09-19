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
    lifestylePreferences?: string
    coreValues?: string
    vibeDescription?: string
    idealPersonDescription?: string
    name?: string
    age?: number
    gender?: string
    phoneNumber?: string
  }
  age?: number
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
  participant_c_number?: number
  participant_d_number?: number
  participant_e_number?: number
  participant_f_number?: number
  compatibility_score: number
  reason: string
  match_id: string
  round: number
  table_number?: number
  match_type?: string
  group_number?: number
  conversation_start_time?: string
  conversation_duration?: number
  conversation_status?: 'pending' | 'active' | 'finished'
  is_repeat_match?: boolean
  
  // Personality data for participants A and B
  participant_a_mbti_type?: string
  participant_b_mbti_type?: string
  participant_a_attachment_style?: string
  participant_b_attachment_style?: string
  participant_a_communication_style?: string
  participant_b_communication_style?: string
  participant_a_lifestyle_preferences?: string
  participant_b_lifestyle_preferences?: string
  participant_a_core_values?: string
  participant_b_core_values?: string
  participant_a_vibe_description?: string
  participant_b_vibe_description?: string
  participant_a_ideal_person_description?: string
  participant_b_ideal_person_description?: string
  
  // Granular compatibility scores
  mbti_compatibility_score?: number
  attachment_compatibility_score?: number
  communication_compatibility_score?: number
  lifestyle_compatibility_score?: number
  core_values_compatibility_score?: number
  vibe_compatibility_score?: number
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
  phase: 'registration' | 'form' | 'waiting' | 'round_1' | 'waiting_2' | 'round_2' | /* 'waiting_3' | 'round_3' | 'waiting_4' | 'round_4' | */ 'group_phase'
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
    lifestylePreferences?: string
    coreValues?: string
    vibeDescription?: string
    idealPersonDescription?: string
    name?: string
    age?: number
    gender?: string
    phoneNumber?: string
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

export type Phase = 'registration' | 'form' | 'waiting' | 'round_1' | 'waiting_2' | 'round_2' | /* 'waiting_3' | 'round_3' | 'waiting_4' | 'round_4' | */ 'group_phase'

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