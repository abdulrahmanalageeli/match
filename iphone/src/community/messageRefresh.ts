import type { CommunitySource, Message } from './data';

// Recheck loaded historical rows as well as the latest page. This covers a
// deleted photo/text and reply excerpts without downloading the entire thread.
export async function refreshHistoricalMessages(source: CommunitySource, requestId: string, previous: Message[], page: Message[]) {
  const newest = new Set(page.map(row => row.id));
  const ids = previous.filter(row => !newest.has(row.id)).map(row => row.id);
  if (!ids.length) return [];
  if (!source.messageChanges) throw Error('تعذّر تحديث الرسائل السابقة.');
  const result: Message[] = [];
  for (let start = 0; start < ids.length; start += 100) {
    result.push(...await source.messageChanges(requestId, ids.slice(start, start + 100)));
  }
  return result;
}
