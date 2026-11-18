import { privateDraftKeychain } from '../session';
import { createPendingChatSends, type PendingChatSends } from './pendingChatSends';

const chatStores = new Map<string, PendingChatSends>();
export function memberPendingSends(owner: string) {
  const store = privateDraftKeychain();
  if (!store) return undefined;
  let journal = chatStores.get(owner);
  if (!journal) { journal = createPendingChatSends(store, owner); chatStores.set(owner, journal); }
  return journal;
}
export async function clearMemberPendingSends(owner: string) {
  const journal = memberPendingSends(owner);
  if (journal) {
    try { await journal.retire(); } finally { chatStores.delete(owner); }
  }
}
