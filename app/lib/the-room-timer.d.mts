export const DEFAULT_ROOM_ROUND_SECONDS: number

export type RoomTimerState = {
  timer_duration_seconds: number
  timer_remaining_seconds: number
  timer_ends_at: string | null
  timer_revision: number
}
export function roomTimerRemaining(event: Partial<RoomTimerState>, now?: number): number
export function formatRoomTimer(seconds: number): string
