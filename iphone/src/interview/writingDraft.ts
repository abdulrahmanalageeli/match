import { privateDraftKeychain } from '../session';
import type { InterviewSnapshot } from './types';
import { draftTTL, draftMemberId } from '../onboarding/vault';

type Store = NonNullable<ReturnType<typeof privateDraftKeychain>>;

export function createWritingDrafts(getStore: () => Store | null) {
  const queues = new Map<string, Promise<void>>();
  function run<T>(owner: string, work: (store: Store, key: string) => Promise<T>) {
    const store = getStore();
    if (!store || !draftMemberId.test(owner)) return Promise.resolve(null);
    const task = (queues.get(owner) ?? Promise.resolve()).then(() => work(store, 'wudayn.interview.pending.' + owner));
    const tail = task.then(() => {}, () => {});
    queues.set(owner, tail);
    void tail.then(() => { if (queues.get(owner) === tail) queues.delete(owner); });
    return task;
  }
  return {
    save(owner: string, snapshot: InterviewSnapshot, text: string, saving?: string) {
      return run(owner, async (store, key) => {
        const doc = snapshot.document;
        await store.write(key, JSON.stringify({
          revision: snapshot.revision, request: doc?.lastRequestId, question: doc?.currentQuestion?.text,
          base: doc?.draftAnswer, saving, text, time: Date.now(),
        }));
        return true;
      });
    },
    restore(owner: string, snapshot: InterviewSnapshot) {
      return run(owner, async (store, key) => {
        const raw = await store.read(key);
        if (!raw) return null;
        const saved = JSON.parse(raw);
        const doc = snapshot.document;
        // A cloud autosave may have committed just before the app closed.
        const sameBase = saved.revision === snapshot.revision && saved.base === doc?.draftAnswer;
        const justSaved = saved.revision + 1 === snapshot.revision && typeof saved.saving === 'string' && saved.saving === doc?.draftAnswer;
        const age = Date.now() - saved.time;
        if (doc && doc.status !== 'confirmed' && !doc.pendingAnalysis && (sameBase || justSaved) &&
            saved.request === doc.lastRequestId && saved.question === doc.currentQuestion?.text &&
            age >= 0 && age < draftTTL && typeof saved.text === 'string') return saved.text as string;
        await store.remove(key);
        return null;
      });
    },
    clear(owner: string) { return run(owner, (store, key) => store.remove(key)); }
  };
}

export const interviewWritingDrafts = createWritingDrafts(privateDraftKeychain);
