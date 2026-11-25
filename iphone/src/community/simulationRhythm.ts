// Fictional routines, expressed as minutes after midnight in Saudi Arabia.
const routines = {
  early: [380, 810, 1190], office: [460, 760, 1250], evening: [650, 1035, 1330],
  shift: [535, 945, 1290], split: [555, 845, 1320], family: [445, 900, 1255],
};
type Routine = keyof typeof routines;
const men: Routine[] = ['office','early','evening','early','family','shift','evening','office','split','office','early','shift','evening','shift','split'];
const women: Routine[] = ['office','early','evening','early','family','shift','evening','office','early','office','office','shift','split','shift','early'];
const minute = 60_000, day = 1440 * minute, riyadhOffset = 180 * minute;

export function rhythmHash(value: string) {
  let h = 2166136261;
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16;
  return Math.imul(h, 2246822507) >>> 0;
}
export const riyadhDay = (time: number) => Math.floor((time + riyadhOffset) / day);

type Tier = 'free' | 'premium' | 'seriousness';
export function demoMembershipTier(id: string, baseline: Tier, time: number): Tier {
  // Only these fictional members periodically subscribe or let a term lapse.
  if (!['p03','p09','p12','wp05','wp08','wp13'].includes(id)) return baseline;
  const period = Math.floor((riyadhDay(time) + rhythmHash(id) % 30) / 30);
  if (period % 4 !== 0) return baseline;
  return baseline === 'free' ? 'premium' : 'free';
}

export function demoVisitWindows(id: string, time: number) {
  const number = riyadhDay(time), midnight = number * day - riyadhOffset;
  const weekday = new Date(number * day).getUTCDay();
  const weekend = weekday === 5 || weekday === 6;
  const series = id.startsWith('w') ? women : men;
  const routine = series[Number(id.replace(/^w?p/, '')) - 1] ?? 'office';
  const seed = rhythmHash(id + '/' + number);
  const rotating = routine === 'shift' && Math.floor(number / 4) % 2 !== 0;
  return routines[routine].flatMap((base, i) => {
    // People miss a check-in, sleep later at the weekend and switch shifts.
    if ((seed >>> (i * 5)) % 5 === 0 && i !== 2) return [];
    const shift = rotating ? (i === 0 ? 140 : -80) : 0;
    const weekendDelay = weekend && i < 2 && routine !== 'shift' ? (i === 0 ? 130 : 85) : 0;
    const jitter = (seed >>> (i * 6)) % 61 - 30;
    const start = midnight + (base + shift + weekendDelay + jitter) * minute;
    return [{start, end: start + (10 + (seed >>> (i * 4)) % 21) * minute}];
  });
}

export function nextDemoVisit(id: string, earliest: number) {
  for (const time of [earliest, earliest + day]) {
    for (const {start, end} of demoVisitWindows(id, time)) {
      if (end > earliest) return Math.max(earliest, start);
    }
  }
  throw Error('Missing fictional availability window');
}
