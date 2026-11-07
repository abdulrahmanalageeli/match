import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { messagePageSize, type CommunitySource, type Message } from "./data";
import { chatError, denied, outboxFor } from "./chatOutbox";
import { mergeMessages } from "./timeline";
import { refreshHistoricalMessages } from "./messageRefresh";

export function useThread(source: CommunitySource, requestId: string) {
  const outbox = useMemo(() => outboxFor(source, requestId), [source, requestId]);
  const local = useSyncExternalStore(outbox.subscribe, outbox.read);
  const [remote, setRemote] = useState<Message[]>([]);
  const remoteRef = useRef(remote); remoteRef.current = remote;
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const historyStarted = useRef(false);
  const olderRequest = useRef(false);
  const epoch = useRef(0);
  const newest = useRef<string | null>(null);
  const requestRefresh = useRef<() => void>(() => {});
  const revoke = useCallback(() => {
    epoch.current++;
    newest.current = null;
    historyStarted.current = false;
    setReady(false);
    setRemote([]);
    setHasOlder(false);
    setLoadingOlder(false);
    outbox.clear();
  }, [outbox]);

  useEffect(() => {
    let active = true;
    let fetching = false;
    let dirty = false;
    async function refresh() {
      if (!active || document.hidden) return;
      if (fetching) { dirty = true; return; }
      fetching = true;
      try {
        const snapshot = remoteRef.current;
        let generation = epoch.current;
        const page = await source.thread(requestId);
        if (!active || generation !== epoch.current) return;
        const gap = page.length === messagePageSize && newest.current !== null && !page.some((m) => m.id === newest.current);
        if (gap) { historyStarted.current = false; generation = ++epoch.current; setLoadingOlder(false); }
        let history: Message[] = [];
        if (historyStarted.current && !gap) {
          try { history = await refreshHistoricalMessages(source, requestId, snapshot, page); }
          catch (err) {
            if (denied(err)) throw err;
            // Do not keep old sensitive rows visible when their current state cannot be checked.
            historyStarted.current = false; generation = ++epoch.current; setLoadingOlder(false);
          }
        }
        if (!active || generation !== epoch.current) return;
        newest.current = page.at(-1)?.id ?? null;
        const checkedIds = new Set(snapshot.map(row => row.id));
        const retainedIds = new Set([...history, ...page].map(row => row.id));
        setRemote((previous) => historyStarted.current && !gap ? mergeMessages(previous.filter(row => !checkedIds.has(row.id) || retainedIds.has(row.id)), [...history, ...page]) : mergeMessages(previous.filter(row => retainedIds.has(row.id)), page));
        if (!historyStarted.current) setHasOlder(page.length === messagePageSize);
        outbox.reconcile(page);
        setReady(true);
        setError("");
      } catch (err) {
        if (!active) return;
        if (denied(err)) revoke();
        setError(chatError(err));
      } finally {
        fetching = false;
        if (active) {
          setLoading(false);
          if (dirty) { dirty = false; void refresh(); }
        }
      }
    }
    requestRefresh.current = refresh;
    void refresh();
    const unwatch = source.watch(refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; epoch.current++; unwatch(); document.removeEventListener('visibilitychange', refresh); requestRefresh.current = () => {}; };
  }, [source, requestId, outbox, revoke]);

  // Also repair a missed broadcast or a response lost after the server committed.
  const lastSettlement = local.outgoing.filter((m) => m.status !== "sending").map((m) => m.clientId + m.status).join(",");
  useEffect(() => { if (lastSettlement) requestRefresh.current(); }, [lastSettlement]);

  async function older() {
    const first = remote[0];
    if (!first || olderRequest.current || !hasOlder || !ready) return;
    olderRequest.current = true;
    setLoadingOlder(true);
    const generation = epoch.current;
    try {
      const page = await source.thread(requestId, first.id);
      if (epoch.current !== generation) return;
      historyStarted.current = true;
      setRemote((previous) => mergeMessages(previous, page));
      outbox.reconcile(page);
      setHasOlder(page.length === messagePageSize);
      setError("");
    } catch (err) {
      if (epoch.current !== generation) return;
      if (denied(err)) revoke();
      setError(chatError(err));
    } finally {
      olderRequest.current = false;
      if (epoch.current === generation) setLoadingOlder(false);
    }
  }
  // Resolve server rows by either identity; a delivered RPC response may precede
  // or follow the private realtime wake-up.
  const saved = new Set(remote.flatMap((m) => [m.id, ...(m.clientId && m.senderIsMe ? [m.clientId] : [])]));
  const deleted = new Map(remote.filter(m => m.deletedAt).map(m => [m.id, m.deletedAt]));
  const rows = ready ? [...remote, ...local.outgoing.filter((m) => !saved.has(m.id) && !saved.has(m.clientId)).map(m => m.reply && deleted.has(m.reply.id) ? { ...m, reply: { ...m.reply, body: 'تم حذف هذه الرسالة', deletedAt: deleted.get(m.reply.id) } } : m)] : [];
  return { rows, lastConfirmedId: ready ? remote.at(-1)?.id : undefined, outbox, draft: local.draft, loading, error, hasOlder, loadingOlder, older, ready, refresh: () => requestRefresh.current() };
}
