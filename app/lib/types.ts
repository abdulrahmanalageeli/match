export interface Participant {
  id: string
  assigned_number: number
  table_number?: number
  q1?: string
  q2?: string
  q3?: string
  q4?: string
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
  match_type: string
  reason: string
  compatibility_score: number
  round: number
  table_number?: number
  match_id: string
  created_at?: string
}

export interface EventState {
  match_id: string
  phase: 'waiting' | 'form' | 'matching' | 'waiting2' | 'matching2'
  announcement?: string
  announcement_type?: 'info' | 'warning' | 'error' | 'success'
  announcement_time?: string
  emergency_paused?: boolean
  pause_time?: string
}

export interface ApiResponse<T = any> {
  success?: boolean
  data?: T
  error?: string
  message?: string
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
  q1?: string
  q2?: string
  q3?: string
  q4?: string
  summary?: string
}

export interface GenerateSummaryRequest {
  responses: Record<string, string>
}

export interface GetMatchesRequest {
  assigned_number: number
  round?: number
}

export type Phase = 'waiting' | 'form' | 'matching' | 'waiting2' | 'matching2'

export interface PhaseConfig {
  label: string
  color: string
  bg: string
  icon: React.ComponentType<{ className?: string }>
} 