import { useEffect, useState } from "react"
import { Clock3, Pause, Play, RotateCcw } from "lucide-react"
import { formatRoomTimer, roomTimerRemaining } from "../lib/the-room-timer.mjs"
import type { RoomTimerState } from "../lib/the-room-timer.mjs"

export type RoomTimerCommand = "start" | "pause" | "reset" | "set-duration"

type Props = {
  event: RoomTimerState & { id: string; active_round: number }
  clockOffsetMs: number
  disabled?: boolean
  stale?: boolean
  projector?: boolean
  onCommand?: (command: RoomTimerCommand, durationSeconds?: number) => void
}

export function RoomRoundTimer({ event, clockOffsetMs, disabled = false, stale = false, projector = false, onCommand }: Props) {
  // Only this small component rerenders each tick, not the whole seating plan.
  const [now, setNow] = useState(() => Date.now())
  const [minutes, setMinutes] = useState(String(event.timer_duration_seconds / 60))
  useEffect(() => {
    setMinutes(String(event.timer_duration_seconds / 60))
  }, [event.id, event.timer_duration_seconds])
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    if (!event.timer_ends_at) return
    const interval = window.setInterval(tick, 250)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [event.timer_ends_at])
  const remaining = roomTimerRemaining(event, now + clockOffsetMs)
  const running = Boolean(event.timer_ends_at) && remaining > 0
  const finished = remaining === 0
  const paused = !event.timer_ends_at && remaining < event.timer_duration_seconds && !finished
  const status = finished ? "انتهى وقت الجولة" : running ? "الجولة جارية" : paused ? "المؤقت متوقف مؤقتًا" : "جاهز لبدء الجولة"
  const validMinutes = Number.isInteger(Number(minutes)) && Number(minutes) >= 1 && Number(minutes) <= 120
  const durationChanged = Number(minutes) * 60 !== event.timer_duration_seconds
  const controlsDisabled = disabled || stale

  return (
    <section data-room-timer aria-label={`مؤقت الجولة ${event.active_round}`} className={`${projector ? "border-y border-white/10 bg-white/[0.025] px-4 py-3" : "rounded-[1.5rem] border border-[#d7ba7d]/20 bg-[#211f1a] p-4 sm:p-5"} text-white`}>
      <div className={`flex ${projector ? "flex-wrap justify-center gap-x-8 gap-y-1" : "justify-between gap-4"} items-center`}>
        <div>
          <p className="flex items-center gap-2 text-xs font-bold text-[#d6b77f]"><Clock3 size={16} /> مؤقت الجولة {event.active_round}</p>
          <p role="status" className={`mt-1 text-sm font-bold ${finished ? "text-rose-300" : "text-white/70"}`}>{status}</p>
        </div>
        <div role="timer" aria-live="off" aria-label={`الوقت المتبقي ${formatRoomTimer(remaining)}`} dir="ltr" className={`${projector ? "text-5xl sm:text-6xl" : "text-4xl sm:text-5xl"} font-extrabold tabular-nums tracking-tight ${finished ? "text-rose-300" : running && remaining <= 60 ? "text-amber-300" : "text-[#efd6a6]"}`}>
          {formatRoomTimer(remaining)}
        </div>
      </div>
      {stale && <p role="status" className="mt-2 text-center text-xs font-bold text-amber-200">الاتصال منقطع · الوقت حسب آخر مزامنة</p>}
      {onCommand && <>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" disabled={controlsDisabled || finished} onClick={() => onCommand(running ? "pause" : "start")} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#e1bd7c] px-3 text-sm font-extrabold text-[#211f1a] disabled:opacity-35">
            {running ? <Pause size={17} /> : <Play size={17} />}{running ? "إيقاف مؤقت" : paused ? "استئناف المؤقت" : "بدء المؤقت"}
          </button>
          <button type="button" disabled={controlsDisabled || (!event.timer_ends_at && remaining === event.timer_duration_seconds)} onClick={() => onCommand("reset")} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 px-3 text-sm font-extrabold text-white/80 disabled:opacity-35"><RotateCcw size={17} /> إعادة المؤقت</button>
        </div>
        <details className="mt-3 border-t border-white/10 pt-1">
          <summary className="min-h-11 cursor-pointer py-3 text-xs font-bold text-white/65">المدة: {event.timer_duration_seconds / 60} دقيقة · {running ? "أوقف المؤقت لتعديلها" : "تعديل المدة"}</summary>
          <form onSubmit={submit => { submit.preventDefault(); if (!controlsDisabled && !running && validMinutes && durationChanged) onCommand("set-duration", Number(minutes) * 60) }} className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <label className="flex items-center gap-2 text-xs font-bold text-white/65">مدة الجولة بالدقائق
            <input type="number" min={1} max={120} step={1} value={minutes} onChange={change => setMinutes(change.target.value)} disabled={controlsDisabled || running} className="h-11 w-20 rounded-xl border border-white/15 bg-white/[0.07] px-2 text-center text-base font-extrabold text-white disabled:opacity-40" />
          </label>
          <button type="submit" disabled={controlsDisabled || running || !validMinutes || !durationChanged} className="min-h-11 rounded-xl border border-white/15 px-4 text-xs font-bold text-[#efd6a6] disabled:opacity-30">تطبيق المدة</button>
          </form>
          <p className="mt-2 text-[11px] leading-5 text-white/55">المدة من دقيقة إلى 120 دقيقة. تطبيقها يعيد المؤقت.</p>
        </details>
        <p className="text-[11px] leading-5 text-white/55">الانتقال للجولة التالية يدوي بعد انتهاء الوقت.</p>
      </>}
    </section>
  )
}
