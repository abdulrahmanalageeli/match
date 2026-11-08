import type { CommunitySource, Filters } from './data';

export type BrowseMemory = { filters: Filters; order: 'recommended' | 'all'; query: string; scroll: number; pages: number; anchor?: { id: string; top: number } };
// Only browsing controls and position are kept, never profile data or private answers.
// Source identity isolates accounts and naturally releases memory after sign-out.
const sessions = new WeakMap<CommunitySource, BrowseMemory>();
export function readBrowseMemory(source: CommunitySource): BrowseMemory {
  return sessions.get(source) ?? { filters: {}, order: 'recommended', query: '', scroll: 0, pages: 1 };
}
export function saveBrowseMemory(source: CommunitySource, memory: BrowseMemory) { sessions.set(source, memory); }
