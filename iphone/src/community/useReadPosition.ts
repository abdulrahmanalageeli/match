import { useEffect, useRef, type RefObject } from "react";
import type { CommunitySource } from "./data";

export function useReadPosition(
  source: CommunitySource, requestId: string, log: RefObject<HTMLDivElement | null>,
  latest: string | undefined, enabled: boolean,
) {
  const acknowledged = useRef<string | undefined>(undefined);
  useEffect(() => {
    const element = log.current;
    if (!element || !latest || !enabled || latest === acknowledged.current) return;
    let active = true;
    let busy = false;
    let frame: number;
    let retry: number;
    async function check() {
      if (!active || document.hidden || document.querySelector('dialog[open]') || busy || acknowledged.current === latest) return;
      const el = element!;
      if (el.scrollHeight - el.scrollTop - el.clientHeight > 60) return;
      const last = Array.from(el.querySelectorAll<HTMLElement>("[data-server-id]")).find((row) => row.dataset.serverId === latest);
      if (!last) return;
      const position = last.getBoundingClientRect(), bounds = el.getBoundingClientRect();
      if (position.bottom < bounds.top || position.bottom > bounds.bottom + 2) return;
      busy = true;
      try {
        await source.markRead(requestId, latest!);
        if (active) acknowledged.current = latest;
      } catch {
        if (active) retry = window.setTimeout(schedule, 5000);
      } finally { busy = false; }
    }
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { void check(); }); }
    schedule();
    element.addEventListener("scroll", schedule, {passive:true});
    document.addEventListener("visibilitychange", schedule);
    document.addEventListener("focusin", schedule);
    window.addEventListener("online", schedule);
    return () => {
      active = false; window.clearTimeout(retry); cancelAnimationFrame(frame);
      element.removeEventListener("scroll", schedule); document.removeEventListener("visibilitychange", schedule); document.removeEventListener("focusin", schedule); window.removeEventListener("online", schedule);
    };
  }, [source, requestId, log, latest, enabled]);
}
