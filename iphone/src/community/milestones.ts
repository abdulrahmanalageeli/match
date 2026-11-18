import type { StepProgress } from './data';
export type MilestoneKind = 'exclusive' | 'family';
// Loading an existing stage is not a new achievement. Rewinds never celebrate.
export function confirmedMilestone(previous: StepProgress | undefined, current: StepProgress): MilestoneKind | null {
  if (!previous || current.stage < previous.stage) return null;
  if (current.stage >= 2 && previous.stage < 2) return 'family';
  if (!previous.exclusive && current.exclusive) return 'exclusive';
  return null;
}
