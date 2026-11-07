import { useEffect, useState } from "react";
import type { CommunitySource } from "./data";

export function useUnreadCount(source: CommunitySource | null) {
  const [snapshot, setSnapshot] = useState<{ source: CommunitySource; count: number } | null>(null);
  useEffect(() => {
    if (!source) return;
    let active = true, fetching = false, dirty = false;
    const refresh = async () => {
      if (!active || document.hidden) return;
      if (fetching) { dirty = true; return; }
      fetching = true;
      try {
        const count = await source.unreadCount();
        if (active) setSnapshot(previous => previous?.source === source && previous.count === count ? previous : { source, count });
      } catch {
        if (active) setSnapshot(null);
      } finally {
        fetching = false;
        if (active && dirty) { dirty = false; void refresh(); }
      }
    };
    void refresh();
    const stop = source.watch(refresh);
    return () => { active = false; stop(); };
  }, [source]);
  return source && snapshot?.source === source ? snapshot.count : 0;
}
