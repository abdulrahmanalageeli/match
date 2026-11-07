import type { ApplicationDraft } from "./draft";

type Storage = {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};
export const draftTTL = 7 * 24 * 60 * 60 * 1000;
const memberId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keyFor = (owner: string) => "nisfayn.intake.v1." + owner;

type Decode = (text: string, owner: string, baseline: string, now: number) => ApplicationDraft | null;

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
  const available = (owner: string) => memberId.test(owner) && Boolean(getStorage());
  function current(owner: string, lease: number) {
    return lease === revision(owner) && !clearing.has(owner);
  }
  return {
    available, revision, current,
    load(owner: string, baseline: string, lease: number) {
      return queue(owner, async () => {
        const storage = memberId.test(owner) ? getStorage() : null;
        if (!storage || !current(owner, lease)) return null;
        const text = await storage.read(keyFor(owner));
        if (text === null || !current(owner, lease)) return null;
        const draft = decode(text, owner, baseline, now());
        if (!draft) await storage.remove(keyFor(owner));
        return draft;
      });
    },
    save(draft: ApplicationDraft, lease: number) {
      return queue(draft.owner, async () => {
        const storage = memberId.test(draft.owner) ? getStorage() : null;
        if (!storage || !current(draft.owner, lease)) return false;
        const { owner, baseline, step, returnToReview } = draft;
        // Server-owned photo metadata and consent receipts are never device draft answers.
        const { portrait: _portrait, signupConsents: _signupConsents, ...answers } = draft.answers;
        await storage.write(keyFor(owner), JSON.stringify({ version: 1, savedAt: now(), owner, baseline, answers, step, returnToReview }));
        return current(owner, lease);
      });
    },
    clear(owner: string) {
      if (!memberId.test(owner) || !getStorage()) return Promise.resolve();
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
