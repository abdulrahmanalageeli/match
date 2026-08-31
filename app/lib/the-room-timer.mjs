export function roomTimerRemaining(event, now = Date.now()) {
  if (event.timer_ends_at) {
    return Math.max(0, Math.ceil((Date.parse(event.timer_ends_at) - now) / 1000))
  }
  return Math.max(0, Number(event.timer_remaining_seconds ?? event.timer_duration_seconds ?? 1800))
}

export function formatRoomTimer(seconds) {
  const value = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
}
