import { Capacitor, registerPlugin } from '@capacitor/core';
import { getDevicePreferences } from '../settings/preferences';

export type FeedbackKind = 'selection' | 'success' | 'warning' | 'error';
const native = registerPlugin<{ notify(options: { kind: FeedbackKind }): Promise<void> }>('NisfaynFeedback');
let lastFeedback = -Infinity;
let lastKind: FeedbackKind | undefined;

export function hasHaptics() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('NisfaynFeedback');
}

/** Acknowledges an explicit, completed decision. Never queues a later vibration. */
export function feedback(kind: FeedbackKind): void {
  if (typeof document === 'undefined' || document.hidden || !getDevicePreferences().haptics || !hasHaptics()) return;
  const now = performance.now();
  // A nearby selection must not swallow the result of the action.
  if (now - lastFeedback < 450 && !(lastKind === 'selection' && kind !== 'selection')) return;
  lastKind = kind;
  lastFeedback = now;
  try { void native.notify({ kind }).catch(() => {}); }
  catch { /* Feedback must never interrupt the action it acknowledges. */ }
}
