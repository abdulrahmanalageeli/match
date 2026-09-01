export const EVENT3_PHASE_TIMER_SECONDS = Object.freeze({
  setup: 0,
  round1: 35 * 60,
  ranking1: 3 * 60,
  round2: 25 * 60,
  ranking2: 3 * 60,
  round3: 25 * 60,
  ranking3: 3 * 60,
  break: 10 * 60,
  phase2_processing: 0,
  phase2_reveal: 26 * 60,
  phase3_processing: 0,
  phase3_reveal: 26 * 60,
  final_reveal: 0,
})

export const EVENT3_TIMER_ROUND_SECONDS = Object.freeze({
  0: EVENT3_PHASE_TIMER_SECONDS.ranking1,
  1: EVENT3_PHASE_TIMER_SECONDS.round1,
  2: EVENT3_PHASE_TIMER_SECONDS.round2,
  // Choice-only timeline shifts its second one-to-one reveal to slot 6.
  6: EVENT3_PHASE_TIMER_SECONDS.phase3_reveal,
  3: EVENT3_PHASE_TIMER_SECONDS.break,
  4: EVENT3_PHASE_TIMER_SECONDS.phase2_reveal,
  5: EVENT3_PHASE_TIMER_SECONDS.phase3_reveal,
})

export function getEvent3PhaseTimerSeconds(phase) {
  return EVENT3_PHASE_TIMER_SECONDS[String(phase || "")] ?? 0
}
