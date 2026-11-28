// Only uncertain outgoing text is journaled. Photos, peer messages and quoted text stay out of Keychain.
export type PendingSend = {
  requestId: string; clientId: string; body: string; createdAt: string;
  reply?: { id: string; senderIsMe: boolean; atSeconds?: number };
};
type Store = {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export function createPendingChatSends(store: Store, owner: string) {
  const key = 'wudayn.chat.pending.v1.' + owner;
  let queue = Promise.resolve();
  let retired = false;
  function serialized<T>(work: () => Promise<T>) {
    const result = queue.then(work);
    queue = result.then(() => {}, () => {});
    return result;
  }
  async function load(): Promise<PendingSend[]> {
    const raw = await store.read(key);
    return raw ? JSON.parse(raw) : [];
  }
  function edit(change: (rows: PendingSend[]) => PendingSend[]) {
    return serialized(async () => {
      if (retired) throw Error('انتهت الجلسة.');
      const before = await load();
      const after = change(before);
      if (after === before) return;
      if (after.length) await store.write(key, JSON.stringify(after));
      else await store.remove(key);
    });
  }
  return {
    list: (id: string) => serialized(async () => retired ? [] : (await load()).filter(row => row.requestId === id)),
    put: (item: PendingSend) => edit(rows => rows.some(row => row.clientId === item.clientId) ? rows : [...rows, item]),
    remove: (ids: Set<string>) => edit(rows => rows.some(row => ids.has(row.clientId)) ? rows.filter(row => !ids.has(row.clientId)) : rows),
    retain: (ids: Set<string>) => edit(rows => rows.every(row => ids.has(row.requestId)) ? rows : rows.filter(row => ids.has(row.requestId))),
    clearThread: (id: string) => edit(rows => rows.some(row => row.requestId === id) ? rows.filter(row => row.requestId !== id) : rows),
    retire() { retired = true; return serialized(() => store.remove(key)); },
  };
}
export type PendingChatSends = ReturnType<typeof createPendingChatSends>;
