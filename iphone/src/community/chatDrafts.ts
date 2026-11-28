import type { MessageReply } from './data';

type SavedReply = Pick<MessageReply, 'id' | 'senderIsMe' | 'atSeconds'>;
export type SavedChatDraft = { text: string; reply?: SavedReply };
type Store = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// Only the member's own text and the original message reference belong on disk.
export function createChatDrafts(store: Store, owner: string, ready = Promise.resolve()) {
  const key = 'wudayn.chat.drafts.v1.' + owner;
  let queue = ready;
  let retired = false;
  let cached: Map<string, SavedChatDraft> | undefined;
  const revisions = new Map<string, number>();
  function serialized<T>(work: () => Promise<T>) {
    const result = queue.then(work);
    queue = result.then(() => {}, () => {});
    return result;
  }
  async function load(): Promise<Map<string, SavedChatDraft>> {
    if (cached) return cached;
    const raw = await store.getItem(key);
    cached = new Map(raw ? JSON.parse(raw) : []);
    return cached;
  }
  async function save(rows: Map<string, SavedChatDraft>) {
    if (rows.size) await store.setItem(key, JSON.stringify([...rows]));
    else await store.removeItem(key);
  }
  return {
    read: (id: string) => serialized(async () => retired ? undefined : (await load()).get(id)),
    write(id: string, text: string, target?: MessageReply) {
      const version = (revisions.get(id) ?? 0) + 1;
      revisions.set(id, version);
      return serialized(async () => {
        if (retired || revisions.get(id) !== version) return;
        const rows = new Map(await load());
        if (text || target) {
          const reply = target && { id: target.id, senderIsMe: target.senderIsMe, atSeconds: target.atSeconds };
          rows.set(id, { text, reply });
        } else if (!rows.delete(id)) return;
        await save(rows);
        cached = rows;
      });
    },
    retain(ids: Set<string>) {
      return serialized(async () => {
        if (retired) return;
        const rows = new Map(await load());
        const size = rows.size;
        for (const id of rows.keys()) if (!ids.has(id)) rows.delete(id);
        if (size !== rows.size) {
          await save(rows);
          cached = rows;
        }
      });
    },
    retire() {
      retired = true;
      return serialized(() => {
        cached = undefined;
        revisions.clear();
        return store.removeItem(key);
      });
    },
  };
}
export type ChatDrafts = ReturnType<typeof createChatDrafts>;
