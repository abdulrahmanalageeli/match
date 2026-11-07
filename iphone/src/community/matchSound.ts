import { getDevicePreferences } from "../settings/preferences";

let context: AudioContext | undefined;
let stopCurrent: (() => void) | undefined;

// An original, short celeste-like signature. Scheduling stays on the audio clock.
// Also accepts OfflineAudioContext so the actual sound can be rendered and checked.
export function scheduleMatchChime(audio: BaseAudioContext, output: AudioNode, at: number) {
  const master = audio.createGain();
  master.gain.value = .85;
  master.connect(output);
  const voices: OscillatorNode[] = [];
  let remaining = 0;
  const note = (frequency: number, offset: number, length: number, level: number) => {
    for (const [ratio, volume] of [[1, 1], [2.002, .16]]) {
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      const start = at + offset;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency * ratio;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(level * volume, start + .012);
      envelope.gain.exponentialRampToValueAtTime(.0001, start + length);
      envelope.gain.linearRampToValueAtTime(0, start + length + .025);
      oscillator.connect(envelope);
      envelope.connect(master);
      remaining++;
      oscillator.onended = () => {
        oscillator.disconnect(); envelope.disconnect();
        if (--remaining === 0) master.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + length + .04);
      voices.push(oscillator);
    }
  };
  note(587.33, 0, .65, .15);
  note(880, .13, .72, .13);
  note(1174.66, .28, 1.08, .12);
  note(146.83, .28, 1.13, .085);
  note(369.99, .31, .95, .055);
  note(440, .34, .98, .045);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    // Disconnect immediately, including notes whose scheduled onset is still ahead.
    master.disconnect();
    voices.forEach(voice => { try { voice.stop(); } catch { /* Already ended. */ } });
  };
}

export async function prepareMatchSound(): Promise<boolean> {
  if (document.hidden || !getDevicePreferences().matchSound) return false;
  try {
    context ??= new AudioContext({ latencyHint: "interactive" });
    if (context.state !== "running") await context.resume();
    return context.state === "running" && !document.hidden;
  } catch { return false; }
}

export function stopMatchSound() {
  stopCurrent?.();
  stopCurrent = undefined;
}

// A quiet single note for activity, sharing the audio context unlocked by a tap.
export function playActivitySound() {
  if (!context || context.state !== 'running' || document.hidden || !getDevicePreferences().matchSound) return;
  try {
    const note = context.createOscillator(), gain = context.createGain(), at = context.currentTime;
    note.type = 'sine'; note.frequency.value = 880;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(.06, at + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, at + .25);
    note.connect(gain); gain.connect(context.destination);
    note.onended = () => { note.disconnect(); gain.disconnect(); };
    note.start(at); note.stop(at + .28);
  } catch { /* An alert remains visible when browser audio is unavailable. */ }
}

export function playMatchSound(delaySeconds = 0): boolean {
  stopMatchSound();
  // Do not queue blocked audio to unexpectedly play during an unrelated later tap.
  if (!context || context.state !== "running" || document.hidden || !getDevicePreferences().matchSound) return false;
  try {
    stopCurrent = scheduleMatchChime(context, context.destination, context.currentTime + delaySeconds + .012);
    return true;
  } catch { stopMatchSound(); return false; }
}

export function initializeMatchSound() {
  const prime = () => { void prepareMatchSound(); };
  const onKey = (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") prime(); };
  const onVisibility = () => {
    if (document.hidden) {
      stopMatchSound();
      void context?.suspend().catch(() => {});
    }
  };
  document.addEventListener("pointerdown", prime, { passive: true });
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    document.removeEventListener("pointerdown", prime);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", onVisibility);
    stopMatchSound();
    void context?.close().catch(() => {});
    context = undefined;
  };
}
