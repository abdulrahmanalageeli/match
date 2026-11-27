import { useEffect, useState } from 'react';
import type { CommunitySource } from './data';

export function useRelationshipCounts(source?: CommunitySource | null) {
  const [snapshot, setSnapshot] = useState<{source: CommunitySource; accepted: number; incoming: number} | null>(null);
  useEffect(() => {
    if (!source) return;
    let active = true, sequence = 0;
    const refresh = async () => {
      if (document.hidden) return;
      const current = ++sequence;
      try {
        const rows = await source.inbox();
        if (active && current === sequence) {
          let accepted = 0, incoming = 0;
          for (const row of rows) {
            if (row.status === 'accepted') accepted++;
            else if (row.status === 'pending' && row.direction === 'incoming') incoming++;
          }
          setSnapshot(previous => previous?.source === source && previous.accepted === accepted && previous.incoming === incoming
            ? previous : {source, accepted, incoming});
        }
      } catch { /* Keep the last known counts while reconnecting. */ }
    };
    void refresh();
    const stop = source.watch(() => void refresh(), 'nonChat');
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      active = false; stop();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [source]);
  return source && snapshot?.source === source ? snapshot : {accepted: 0, incoming: 0};
}
