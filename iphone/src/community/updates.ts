import { cloud } from "../cloud";

export type WatchUpdates = (onChange: () => void) => () => void;

// One private channel and one fallback timer are shared by the visible inbox and thread.
// Broadcast is only a wake-up signal. Message contents come from the authorized RPC.
export function privateUpdates(userId: string): WatchUpdates {
  const listeners = new Set<() => void>();
  let channel: ReturnType<NonNullable<typeof cloud>["channel"]> | undefined;
  let connected = false;
  let timer: number | undefined;
  let closing: Promise<void> | null = null;
  const notify = () => {
    if (!document.hidden) listeners.forEach((listener) => listener());
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
    active.on("broadcast", { event: "changed" }, notify).subscribe((status) => {
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
  return (listener) => {
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
