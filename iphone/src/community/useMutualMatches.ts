import { useCallback, useEffect, useRef, useState } from "react";
import type { CommunitySource, Connection } from "./data";
import { denied } from "./chatOutbox";

// Session-only: never persist peer identities or replay historic accepted chats.
export function useMutualMatches(source: CommunitySource | null) {
  const [snapshot, setSnapshot] = useState<{ source: CommunitySource; matches: Connection[] } | null>(null);
  const monitor = useRef<{
    source: CommunitySource;
    announce: (connection: Connection) => void;
    dismiss: (id: string) => void;
  } | null>(null);

  useEffect(() => {
    if (!source) { monitor.current = null; setSnapshot(null); return; }
    let active = true, fetching = false, dirty = false, initialized = false, revision = 0;
    let previous = new Map<string, Connection["status"]>();
    let queue: Connection[] = [];
    const shown = new Set<string>();
    const eventKey = (connection: Connection) => connection.celebrationKey || connection.id;
    const publish = () => {
      if (active) setSnapshot({ source, matches: [...queue] });
    };
    const announce = (connection: Connection) => {
      if (!active || connection.status !== "accepted" || shown.has(eventKey(connection))) return;
      shown.add(eventKey(connection));
      previous.set(connection.id, "accepted");
      const queued = queue.findIndex(row=>row.id===connection.id);
      if(queued>=0) queue[queued]=connection; else queue.push(connection);
      revision++;
      publish();
    };
    const refresh = async () => {
      if (!active || document.hidden) return;
      if (fetching) { dirty = true; return; }
      fetching = true;
      do {
        dirty = false;
        const before = revision;
        try {
          const rows = await source.inbox();
          if (!active) break;
          // A confirmed local acceptance wins over a read that started earlier.
          if (before !== revision) { dirty = true; continue; }
          for (const row of rows) {
            if (row.status !== "accepted") continue;
            if (row.celebrationKey || initialized && previous.get(row.id) !== "accepted") announce(row);
            else shown.add(eventKey(row));
          }
          initialized = true;
          previous = new Map(rows.map(row => [row.id, row.status]));
          const accepted = new Set(rows.filter(row => row.status === "accepted").map(row => row.id));
          const available = queue.filter(row => accepted.has(row.id));
          if (available.length !== queue.length) { queue = available; publish(); }
        } catch (error) {
          if (active && denied(error)) { queue = []; previous.clear(); publish(); }
        }
      } while (active && dirty && !document.hidden);
      fetching = false;
    };
    const session = { source, announce, dismiss(id: string) {
      const dismissed = queue.find(row=>row.id===id);
      if(dismissed?.celebrationKey) void source.acknowledgeMatch?.(dismissed.celebrationKey).catch(()=>{shown.delete(eventKey(dismissed));});
      queue = queue.filter(row => row.id !== id);
      publish();
    } };
    monitor.current = session;
    publish();
    void refresh();
    const stop = source.watch(refresh);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      stop();
      document.removeEventListener("visibilitychange", visible);
      if (monitor.current === session) monitor.current = null;
    };
  }, [source]);

  const announce = useCallback((connection: Connection) => {
    if (monitor.current?.source === source) monitor.current.announce(connection);
  }, [source]);
  const dismiss = useCallback((id: string) => {
    if (monitor.current?.source === source) monitor.current.dismiss(id);
  }, [source]);
  return { match: snapshot?.source === source ? snapshot?.matches[0] : undefined, announce, dismiss };
}
