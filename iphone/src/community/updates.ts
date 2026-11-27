import { cloud } from "../cloud";

export type ChatSignal = { kind: 'typing' | 'message' | 'receipt' | 'ownRead'; requestId: string; messageId?: string };
export type WatchScope = 'nonChat' | { threadId: string; typing?: boolean; onMessage?: (id: string) => void; onReceipt?: () => void };
export type WatchUpdates = (onChange: () => void, scope?: WatchScope) => () => void;

export function routeUpdate(refresh: () => void, scope?: WatchScope) {
  return (signal?: ChatSignal) => {
    if (!signal) return refresh();
    if (scope === 'nonChat') return;
    if (scope && signal.requestId !== scope.threadId) return;
    if (signal.kind === 'typing') { if (scope?.typing) refresh(); return; }
    if (scope?.typing || (scope && signal.kind === 'ownRead')) return;
    if (signal.kind === 'message' && signal.messageId && scope?.onMessage) return scope.onMessage(signal.messageId);
    if (signal.kind === 'receipt' && scope?.onReceipt) return scope.onReceipt();
    refresh();
  };
}

// One private channel and one fallback timer are shared by the visible inbox and thread.
// Broadcast is only a wake-up signal. Message contents come from the authorized RPC.
export function privateUpdates(userId: string): WatchUpdates {
  const listeners = new Set<(signal?: ChatSignal) => void>();
  let channel: ReturnType<NonNullable<typeof cloud>["channel"]> | undefined;
  let connected = false;
  let timer: number | undefined;
  let closing: Promise<void> | null = null;
  const notify = (signal?: ChatSignal) => {
    if (!document.hidden) listeners.forEach((listener) => listener(signal));
  };
  const schedule = () => {
    window.clearInterval(timer);
    if (!document.hidden && listeners.size) {
      timer = window.setInterval(notify, connected ? 45_000 : 5_000);
    }
  };
  const disconnect = () => {
    const old = channel;
    channel = undefined;
    connected = false;
    if (cloud && old) {
      closing = cloud.removeChannel(old).then(() => {}, () => {}).finally(() => {
        closing = null;
        connect();
      });
    }
  };
  const connect = () => {
    if (!cloud || channel || closing || document.hidden || !listeners.size) return;
    const active = cloud.channel("marriage:member:" + userId, { config: { private: true } });
    channel = active;
    active.on("broadcast", { event: "changed" }, ({payload}) => {
      if (active !== channel) return;
      const {kind, requestId, messageId} = payload ?? {};
      if (typeof requestId === 'string' && ['typing','message','receipt','ownRead'].includes(kind)) {
        notify({kind, requestId, messageId: typeof messageId === 'string' ? messageId : undefined});
      } else notify();
    }).subscribe((status) => {
      if (active !== channel) return;
      connected = status === "SUBSCRIBED";
      schedule();
      if (connected) notify();
    });
  };
  const visible = () => {
    if (document.hidden) disconnect();
    else { connect(); notify(); }
    schedule();
  };
  return (onChange, scope) => {
    const listener = routeUpdate(onChange, scope);
    listeners.add(listener);
    if (listeners.size === 1) {
      document.addEventListener("visibilitychange", visible);
      window.addEventListener("online", visible);
      connect();
      schedule();
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size) return;
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
      window.clearInterval(timer);
      disconnect();
    };
  };
}
