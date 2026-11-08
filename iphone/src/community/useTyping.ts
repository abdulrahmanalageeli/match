import { useEffect, useRef, useState } from 'react';
import type { CommunitySource } from './data';

/** Typing is ephemeral intent, never the draft itself. */
export function useTyping(source: CommunitySource, id: string, enabled: boolean) {
  const [peerTyping, setPeerTyping] = useState(false);
  const touch = useRef<() => void>(() => {}), stop = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true, reading = false, lastSent = 0, transmitting = false;
    let idle: number | undefined, refreshTimer: number | undefined;
    let desired = false, sent = false;
    async function write() {
      if (!source.setTyping || transmitting) return;
      transmitting = true; const value = desired;
      try { await source.setTyping(id, value); sent = value; }
      catch { /* Typing never interrupts sending a message. */ }
      finally { transmitting = false; if (desired !== value) void write(); }
    }
    function finish() {
      window.clearTimeout(idle); desired = false;
      if (sent || transmitting) void write();
    }
    touch.current = () => {
      if (!enabled || document.hidden) return;
      const starting = !desired; desired = true; const now = Date.now();
      if (starting || now - lastSent > 2500) { lastSent = now; void write(); }
      window.clearTimeout(idle); idle = window.setTimeout(finish, 3500);
    };
    stop.current = finish;
    async function refresh() {
      if (!active || !enabled || document.hidden || reading || !source.typingState) return;
      reading = true;
      try { const value = await source.typingState(id); if (active && !document.hidden) setPeerTyping(value); }
      catch { if (active) setPeerTyping(false); }
      finally { reading = false; }
    }
    const changed = () => {
      if (refreshTimer !== undefined) return;
      refreshTimer = window.setTimeout(() => { refreshTimer = undefined; void refresh(); }, 180);
    };
    const hide = () => { if (document.hidden) { finish(); setPeerTyping(false); } else void refresh(); };
    setPeerTyping(false); void refresh();
    const unwatch = enabled ? source.watch(changed) : () => {};
    const timer = enabled && source.typingState ? window.setInterval(() => void refresh(), 2500) : undefined;
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', finish);
    return () => {
      active = false; finish(); touch.current = () => {}; stop.current = () => {};
      unwatch(); window.clearInterval(timer); window.clearTimeout(refreshTimer); document.removeEventListener('visibilitychange', hide); window.removeEventListener('blur', finish);
    };
  }, [source, id, enabled]);
  return { peerTyping: enabled && peerTyping, touch: () => touch.current(), stop: () => stop.current() };
}
