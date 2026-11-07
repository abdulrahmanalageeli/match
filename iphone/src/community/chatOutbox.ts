import type { CommunitySource, Message, MessageReply } from "./data";

export type Outgoing = Message & {
  clientId: string;
  status: "sending" | "failed" | "saved";
  error?: string;
};
type Snapshot = { draft: string; outgoing: Outgoing[]; reply?: MessageReply };

export function denied(error: unknown) {
  return error instanceof Error && "status" in error && (error.status === 401 || error.status === 403);
}
export function chatError(error: unknown) {
  return error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
    ? error.message : "تعذّر الاتصال. تحقّق من اتصالك وحاول مجددًا.";
}

// Kept in memory for this signed-in source only. Navigating away preserves a draft
// or uncertain send; signing out drops the source and all of its private drafts.
class Outbox {
  private state: Snapshot = { draft: "", outgoing: [] };
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  readonly read = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private source: CommunitySource;
  private requestId: string;
  constructor(source: CommunitySource, requestId: string) {
    this.source = source;
    this.requestId = requestId;
  }
  private update(state: Snapshot) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  write(draft: string) { this.update({ ...this.state, draft }); }
  replyTo(reply?: MessageReply) { this.update({ ...this.state, reply }); }
  clear() { this.update({ draft: "", outgoing: [] }); }
  enqueue(body: string) {
    const clientId = crypto.randomUUID();
    const item: Outgoing = { clientId, id: clientId, body, senderIsMe: true, createdAt: new Date().toISOString(), status: "sending", ...(this.state.reply ? { reply: { ...this.state.reply } } : {}) };
    this.update({ draft: "", outgoing: [...this.state.outgoing, item] });
    this.dispatch(clientId);
    return clientId;
  }
  retry(clientId: string) {
    if (this.state.outgoing.find((m) => m.clientId === clientId)?.status !== "failed") return;
    this.replace(clientId, { status: "sending", error: undefined });
    this.dispatch(clientId);
  }
  private replace(clientId: string, patch: Partial<Outgoing>) {
    if (!this.state.outgoing.some((item) => item.clientId === clientId)) return;
    this.update({ ...this.state, outgoing: this.state.outgoing.map((item) => item.clientId === clientId ? { ...item, ...patch } : item) });
  }
  private dispatch(clientId: string) {
    this.queue = this.queue.then(async () => {
      const item = this.state.outgoing.find((m) => m.clientId === clientId);
      if (!item) return;
      try {
        const id = await this.source.send(this.requestId, item.body, clientId, item.reply?.id);
        this.replace(clientId, { id, status: "saved" });
      } catch (error) {
        this.replace(clientId, { status: "failed", error: chatError(error) });
      }
    });
  }
  reconcile(remote: Message[]) {
    const ids = new Set(remote.map((m) => m.id));
    const clients = new Set(remote.filter((m) => m.senderIsMe && m.clientId).map((m) => m.clientId));
    const outgoing = this.state.outgoing.filter((m) => !ids.has(m.id) && !clients.has(m.clientId));
    if (outgoing.length !== this.state.outgoing.length) this.update({ ...this.state, outgoing });
  }
}
const sessions = new WeakMap<CommunitySource, Map<string, Outbox>>();
export function outboxFor(source: CommunitySource, requestId: string) {
  let session = sessions.get(source);
  if (!session) { session = new Map(); sessions.set(source, session); }
  let box = session.get(requestId);
  if (!box) { box = new Outbox(source, requestId); session.set(requestId, box); }
  return box;
}
export function discardClosedDrafts(source: CommunitySource, openIds: Set<string>) {
  const session = sessions.get(source);
  for (const [id, box] of session ?? []) {
    if (!openIds.has(id)) { box.clear(); session!.delete(id); }
  }
}
