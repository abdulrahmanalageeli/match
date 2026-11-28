import type { ChatAttachment, CommunitySource, Message, MessageReply } from "./data";

export type Outgoing = Message & {
  clientId: string;
  status: "sending" | "failed" | "saved";
  error?: string;
  localFile?: Blob;
};
type Snapshot = { draft: string; outgoing: Outgoing[]; reply?: MessageReply };

export function denied(error: unknown) {
  return error instanceof Error && "status" in error && (error.status === 401 || error.status === 403);
}
export function chatError(error: unknown) {
  return error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
    ? error.message : "تعذّر الاتصال. تحقّق من اتصالك وحاول مجددًا.";
}

// A draft is restored only after the thread has been authorized by the source.
class Outbox {
  private state: Snapshot = { draft: "", outgoing: [] };
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  readonly read = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private restored = false;
  private draftRestored = false;
  private draftRevision = 0;
  private generation = 0;
  private async restoreDraft(page: Message[]) {
    const drafts = this.source.drafts;
    if (!drafts || this.draftRestored) return;
    const revision = this.draftRevision;
    const saved = await drafts.read(this.requestId);
    if (revision !== this.draftRevision) return;
    let reply: MessageReply | undefined;
    if (saved?.reply) {
      const reference = saved.reply;
      let original = page.find(row => row.id === reference.id);
      if (!original && this.source.messageChanges) {
        try { [original] = await this.source.messageChanges(this.requestId, [reference.id]); }
        catch (error) {
          if (denied(error)) throw error;
          reply = { ...reference, body: 'رسالة سابقة' };
        }
      }
      if (original && !original.deletedAt) {
        const media = original.attachment;
        const body = media ? (media.kind === 'audio' ? 'رسالة صوتية' : media.viewOnce ? 'صورة لمرة واحدة' : 'صورة') : original.body.slice(0, 240);
        reply = { id: original.id, senderIsMe: original.senderIsMe, body, atSeconds: media?.kind === 'audio' ? reference.atSeconds : undefined };
      } else if (!original && !this.source.messageChanges) {
        reply = { ...reference, body: 'رسالة سابقة' };
      }
    }
    if (revision !== this.draftRevision) return;
    this.draftRestored = true;
    if (saved) this.update({ ...this.state, draft: saved.text, reply }, false);
  }
  async restore(page: Message[] = []) {
    const generation = this.generation;
    await this.restoreDraft(page).catch(error => { if (denied(error)) throw error; });
    const journal = this.source.pendingSends;
    if (!journal || this.restored || generation !== this.generation) return;
    const rows = await journal.list(this.requestId);
    const confirmed = new Set(page.flatMap(row => row.senderIsMe && row.clientId ? [row.clientId] : []));
    const missing = rows.filter(row => !confirmed.has(row.clientId)).map(row => row.clientId);
    let checked = true;
    if (this.source.committedSends && missing.length) {
      try {
        for (let i = 0; i < missing.length; i += 100) {
          const ids = await this.source.committedSends(this.requestId, missing.slice(i, i + 100));
          for (const id of ids) confirmed.add(id);
        }
      } catch (error) {
        if (denied(error)) throw error;
        checked = false;
      }
    }
    if (generation !== this.generation) return;
    this.restored = checked;
    const settled = new Set(rows.filter(row => confirmed.has(row.clientId)).map(row => row.clientId));
    if (settled.size) {
      void journal.remove(settled).catch(() => {});
      this.update({...this.state, outgoing: this.state.outgoing.filter(row => !settled.has(row.clientId))});
    }
    const known = new Set(this.state.outgoing.map(row => row.clientId));
    const recovered: Outgoing[] = rows.filter(row => !known.has(row.clientId) && !confirmed.has(row.clientId)).map(row => ({
      id: row.clientId, clientId: row.clientId, createdAt: row.createdAt, body: row.body, senderIsMe: true,
      status: 'failed', error: 'لم يتأكّد الإرسال. يمكنك المحاولة مجددًا.',
      ...(row.reply ? {reply: {...row.reply, body: 'رسالة سابقة'}} : {}),
    }));
    if (recovered.length) this.update({...this.state, outgoing: [...recovered, ...this.state.outgoing]});
  }
  private source: CommunitySource;
  private requestId: string;
  constructor(source: CommunitySource, requestId: string) {
    this.source = source;
    this.requestId = requestId;
  }
  private update(state: Snapshot, persistDraft = true) {
    if (persistDraft && (state.draft !== this.state.draft || state.reply !== this.state.reply)) {
      this.draftRestored = true;
      this.draftRevision++;
      void this.source.drafts?.write(this.requestId, state.draft, state.reply).catch(() => {});
    }
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  write(draft: string) { this.update({ ...this.state, draft }); }
  replyTo(reply?: MessageReply) { this.update({ ...this.state, reply }); }
  clear(forgetPending = true) {
    this.generation++;
    this.draftRevision++;
    this.draftRestored = false;
    this.restored = false;
    if (forgetPending) void this.source.pendingSends?.clearThread(this.requestId).catch(() => {});
    if (forgetPending) void this.source.drafts?.write(this.requestId, '').catch(() => {});
    this.update({ draft: "", outgoing: [] }, false);
  }
  enqueue(body: string) {
    const clientId = crypto.randomUUID();
    const item: Outgoing = { clientId, id: clientId, body, senderIsMe: true, createdAt: new Date().toISOString(), status: "sending", ...(this.state.reply ? { reply: { ...this.state.reply } } : {}) };
    this.update({ draft: "", outgoing: [...this.state.outgoing, item] });
    this.dispatch(clientId);
    return clientId;
  }
  enqueueMedia(file: Blob, kind: ChatAttachment['kind'], clientId: string, duration?: number, viewOnce = false) {
    if (!this.source.sendMedia || this.state.outgoing.some(row => row.clientId === clientId)) return;
    const item: Outgoing = {
      id: clientId, clientId, senderIsMe: true, createdAt: new Date().toISOString(), status: 'sending',
      body: kind === 'audio' ? 'رسالة صوتية' : viewOnce ? 'صورة لمرة واحدة' : 'صورة',
      ...(this.state.reply && {reply:{...this.state.reply}}),
      attachment: {id: clientId, kind, mime:file.type, size:file.size, duration, viewOnce}, localFile:file,
    };
    this.update({draft:this.state.draft, outgoing:[...this.state.outgoing, item]});
    void this.upload(item);
  }
  private async upload(item: Outgoing) {
    const {attachment, localFile, clientId} = item;
    if (!attachment || !localFile || !this.source.sendMedia) return;
    try {
      const media = [this.requestId, localFile, attachment.kind, clientId, attachment.duration, attachment.viewOnce] as const;
      const id = item.reply
        ? await this.source.sendMedia(...media, item.reply.id, item.reply.atSeconds)
        : await this.source.sendMedia(...media);
      this.replace(clientId, {id, status:'saved'});
    } catch (error) {
      this.replace(clientId, {status:'failed', error:chatError(error)});
    }
  }
  discardAttachment(clientId: string) {
    this.update({...this.state, outgoing:this.state.outgoing.filter(row =>
      row.clientId !== clientId || !row.localFile || row.status !== 'failed')});
  }
  retry(clientId: string) {
    const item = this.state.outgoing.find(m => m.clientId === clientId);
    if (item?.status !== "failed") return;
    this.replace(clientId, { status: "sending", error: undefined });
    if (item.localFile) void this.upload(item);
    else this.dispatch(clientId);
  }
  private replace(clientId: string, patch: Partial<Outgoing>) {
    if (!this.state.outgoing.some((item) => item.clientId === clientId)) return;
    this.update({ ...this.state, outgoing: this.state.outgoing.map((item) => item.clientId === clientId ? { ...item, ...patch } : item) });
  }
  private dispatch(clientId: string) {
    const pending = this.state.outgoing.find(row => row.clientId === clientId);
    if (!pending) return;
    // Start the durable write immediately, even while an earlier send is in flight.
    const stored = this.source.pendingSends?.put({
      requestId: this.requestId, clientId, body: pending.body, createdAt: pending.createdAt,
      ...(pending.reply ? {reply: {id: pending.reply.id, senderIsMe: pending.reply.senderIsMe, ...(pending.reply.atSeconds !== undefined && {atSeconds:pending.reply.atSeconds})}} : {}),
    }).then(() => true, () => false);
    this.queue = this.queue.then(async () => {
      const durable = await stored;
      const item = this.state.outgoing.find((m) => m.clientId === clientId);
      if (!item) return;
      try {
        if (durable === false) throw Error('تعذّر حفظ محاولة الإرسال على جهازك. حاول مجددًا.');
        const id = await this.source.send(this.requestId, item.body, clientId, item.reply?.id, item.reply?.atSeconds);
        this.replace(clientId, { id, status: "saved" });
        void this.source.pendingSends?.remove(new Set([clientId])).catch(() => {});
      } catch (error) {
        this.replace(clientId, { status: "failed", error: chatError(error) });
      }
    });
  }
  reconcile(remote: Message[]) {
    const ids = new Set(remote.map((m) => m.id));
    const clients = new Set(remote.filter((m) => m.senderIsMe && m.clientId).map((m) => m.clientId));
    const outgoing = this.state.outgoing.filter((m) => !ids.has(m.id) && !clients.has(m.clientId));
    if (outgoing.length !== this.state.outgoing.length) {
      const settled = this.state.outgoing.filter(row => ids.has(row.id) || clients.has(row.clientId));
      const journalIds = new Set(settled.filter(row => !row.localFile).map(row => row.clientId));
      if (journalIds.size) void this.source.pendingSends?.remove(journalIds).catch(() => {});
      this.update({ ...this.state, outgoing });
    }
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
// Rebuilding a signed-in source is not evidence that any relationship closed.
export function releaseChatSource(source: CommunitySource) {
  for (const box of sessions.get(source)?.values() ?? []) box.clear(false);
  sessions.delete(source);
}

export async function sendNotificationReply(source: CommunitySource, requestId: string, body: string, clientId: string) {
  const journal = source.pendingSends;
  await journal?.put({requestId, clientId, body, createdAt: new Date().toISOString()});
  await source.send(requestId, body, clientId);
  await journal?.remove(new Set([clientId])).catch(() => {});
}

export function discardClosedDrafts(source: CommunitySource, openIds: Set<string>) {
  void source.drafts?.retain(openIds).catch(() => {});
  void source.pendingSends?.retain(openIds).catch(() => {});
  const session = sessions.get(source);
  for (const [id, box] of session ?? []) {
    if (!openIds.has(id)) { box.clear(); session!.delete(id); }
  }
}
