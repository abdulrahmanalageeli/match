import { authStorage } from '../session';
import { createChatDrafts, type ChatDrafts } from './chatDrafts';

// Device-only Keychain on iOS. On the web drafts expire with the signed-in tab.
const owners = new Map<string, ChatDrafts>();
const closing = new Map<string, Promise<void>>();
export function memberChatDrafts(owner: string) {
  let drafts = owners.get(owner);
  if (!drafts) {
    drafts = createChatDrafts(authStorage, owner, closing.get(owner));
    owners.set(owner, drafts);
  }
  return drafts;
}
export function clearMemberChatDrafts(owner: string) {
  const drafts = memberChatDrafts(owner);
  owners.delete(owner);
  const removal = drafts.retire();
  closing.set(owner, removal);
  void removal.then(() => {
    if (closing.get(owner) === removal) closing.delete(owner);
  }, () => {});
  return removal;
}
