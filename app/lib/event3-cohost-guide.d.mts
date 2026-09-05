export type Event3ChoiceCohostPhaseName =
  | "setup"
  | "round1"
  | "ranking1"
  | "round2"
  | "ranking2"
  | "round3"
  | "ranking3"
  | "phase2_processing"
  | "break"
  | "phase2_reveal"
  | "phase3_processing"
  | "phase3_reveal"
  | "phase4_processing"
  | "phase4_reveal"
  | "final_reveal"

export interface Event3ChoiceCohostPhaseGuide {
  phase: Event3ChoiceCohostPhaseName
  label: string
  durationSeconds: number
  durationLabel: string
  instruction: string
  expiredInstruction: string | null
  nextAction: string
}

export const EVENT3_CHOICE_COHOST_PHASES: readonly Readonly<Event3ChoiceCohostPhaseGuide>[]

export function getEvent3ChoiceCohostPhase(phase?: string | null): Readonly<Event3ChoiceCohostPhaseGuide> | null
export function getEvent3ChoiceCohostPhaseIndex(phase?: string | null): number
export function getEvent3ChoiceCohostNextPhase(phase?: string | null): Readonly<Event3ChoiceCohostPhaseGuide> | null

export function getEvent3CohostTimerStatus(input: {
  active: boolean
  startTime?: string | null
  durationSeconds?: number | null
  nowMs?: number
}): {
  state: "inactive" | "running" | "expired"
  remainingSeconds: number
}

export function calculateEvent3ServerClockOffsetMs(input: {
  serverNow?: string | null
  requestStartedAt: number
  responseReceivedAt: number
}): number

export interface Event3DisplayedMutationContext {
  expected_event_id: number
  expected_test_mode: boolean
  expected_test_session_key: string
}

export function buildEvent3DisplayedMutationContext(input: {
  eventId?: number | string | null
  testMode?: boolean | null
  testSessionKey?: string | null
}): Event3DisplayedMutationContext | null

export type Event3GroupFeedbackStatus = "missing" | "partial" | "complete" | "not_applicable"

export function summarizeEvent3GroupFeedbackProgress(statuses: Iterable<Event3GroupFeedbackStatus>): {
  expectedCount: number
  completeCount: number
  partialCount: number
  missingCount: number
  remainingCount: number
}
