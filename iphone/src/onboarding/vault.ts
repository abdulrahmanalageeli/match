import type { ApplicationDraft } from "./draft";

type Storage = {
  read: (key: string, baseline?: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};
export const draftTTL = 30 * 24 * 60 * 60 * 1000;
export const draftMemberId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keyFor = (owner: string) => "nisfayn.intake.v1." + owner;

type Decode = (text: string, owner: string, baseline: string, now: number) => ApplicationDraft | null;

function payload(draft: ApplicationDraft) {
  const { portrait: _portrait, signupConsents: _signupConsents, ...answers } = draft.answers;
  const { owner, baseline, step, returnToReview, permissions } = draft;
  return { version: 1, owner, baseline, answers, step, returnToReview, ...(draft.lunaFields && permissions?.assessment ? {lunaFields:draft.lunaFields} : {}), ...(permissions ? { permissions } : {}) };
}

export function createDraftVault(getStorage: () => Storage | null, decode: Decode, now = Date.now) {
  const pending = new Map<string, Promise<void>>();
  const revisions = new Map<string, number>();
  const clearing = new Set<string>();
  const revision = (owner: string) => revisions.get(owner) ?? 0;
  function queue<T>(owner: string, action: () => Promise<T>) {
    const task = (pending.get(owner) ?? Promise.resolve()).then(action);
    const tail = task.then(() => {}, () => {});
    pending.set(owner, tail);
    void tail.then(() => { if (pending.get(owner) === tail) pending.delete(owner); });
    return task;
  }
  const available = (owner: string) => draftMemberId.test(owner) && Boolean(getStorage());
  function current(owner: string, lease: number) {
    return lease === revision(owner) && !clearing.has(owner);
  }
  return {
    available, revision, current,
    // End this screen/session's write lease without deleting its account draft.
    release(owner: string) {
      revisions.set(owner, revision(owner) + 1);
      return queue(owner, async () => {});
    },
    load(owner: string, baseline: string, lease: number) {
      return queue(owner, async () => {
        const storage = draftMemberId.test(owner) ? getStorage() : null;
        if (!storage || !current(owner, lease)) return null;
        const text = await storage.read(keyFor(owner), baseline);
        if (text === null || !current(owner, lease)) return null;
        const draft = decode(text, owner, baseline, now());
        if (!draft) await storage.remove(keyFor(owner));
        return draft;
      });
    },
    save(draft: ApplicationDraft, lease: number) {
      return queue(draft.owner, async () => {
        const storage = draftMemberId.test(draft.owner) ? getStorage() : null;
        if (!storage || !current(draft.owner, lease)) return false;
        const { owner } = draft;
        await storage.write(keyFor(owner), JSON.stringify({ ...payload(draft), savedAt: now() }));
        return current(owner, lease);
      });
    },
    acknowledge(draft: ApplicationDraft, lease: number) {
      // An older network response must never clear a newer offline edit.
      return queue(draft.owner, async () => {
        const storage = getStorage();
        if (!storage || !current(draft.owner, lease)) return;
        const key = keyFor(draft.owner);
        const saved = await storage.read(key, draft.baseline);
        if (!saved) return;
        const stored = decode(saved, draft.owner, draft.baseline, now());
        const submitted = decode(JSON.stringify({ ...payload(draft), savedAt: now() }), draft.owner, draft.baseline, now());
        if (stored && submitted && JSON.stringify(stored) === JSON.stringify(submitted)) await storage.remove(key);
      });
    },
    clear(owner: string) {
      if (!draftMemberId.test(owner) || !getStorage()) return Promise.resolve();
      const next = revision(owner) + 1;
      revisions.set(owner, next);
      clearing.add(owner);
      return queue(owner, async () => {
        await getStorage()?.remove(keyFor(owner));
        if (revision(owner) === next) clearing.delete(owner);
      });
    },
  };
}
