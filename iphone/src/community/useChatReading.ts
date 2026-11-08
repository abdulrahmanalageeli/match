import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { CommunitySource, Message } from './data';

type Position = { id?: string; offset: number; bottom: boolean };
// Session-only geometry, scoped to the account's source. No message content is stored.
const positions = new WeakMap<CommunitySource, Map<string, Position>>();
type ReadingThread = { rows: Message[]; ready: boolean; hasOlder: boolean; loadingOlder: boolean; error: string; older: () => Promise<void> };

export function useChatReading(source: CommunitySource, id: string, log: RefObject<HTMLDivElement | null>,
  atBottom: RefObject<boolean>, thread: ReadingThread, visible: boolean) {
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [readLoaded, setReadLoaded] = useState(!source.readState);
  const [positioned, setPositioned] = useState(false);
  const initialized = useRef(false), restore = useRef(true);
  const paging = useRef(false);

  function remember() {
    const element = log.current;
    if (!element || !initialized.current) return;
    const bounds = element.getBoundingClientRect();
    const row = Array.from(element.querySelectorAll<HTMLElement>('[data-server-id]'))
      .find(item => item.getBoundingClientRect().bottom > bounds.top + 1);
    const saved = positions.get(source) ?? new Map<string, Position>();
    saved.set(id, { id: row?.dataset.serverId, offset: row ? row.getBoundingClientRect().top - bounds.top : 0, bottom: atBottom.current });
    positions.set(source, saved);
  }
  useLayoutEffect(() => {
    let active = true;
    initialized.current = false; restore.current = true; setPositioned(false);
    setFirstUnreadId(null); setReadLoaded(!source.readState);
    if (source.readState) void source.readState(id).then(value => {
      if (active) setFirstUnreadId(value.firstUnreadId);
    }).catch(() => {}).finally(() => { if (active) setReadLoaded(true); });
    return () => { active = false; };
  }, [source, id]);
  useLayoutEffect(() => {
    if (!visible) { restore.current = true; return; }
    const element = log.current;
    if (!element || !readLoaded || !thread.ready || !restore.current) return;
    const saved = positions.get(source)?.get(id);
    const target = saved && !saved.bottom ? saved.id : !initialized.current ? firstUnreadId : undefined;
    const row = target ? Array.from(element.querySelectorAll<HTMLElement>('[data-server-id]')).find(item => item.dataset.serverId === target) : undefined;
    if (target && !row && thread.hasOlder && !thread.error) {
      if (!thread.loadingOlder && !paging.current) {
        paging.current = true;
        void thread.older().finally(() => { paging.current = false; });
      }
      return;
    }
    if (row) {
      const offset = saved && !saved.bottom ? saved.offset : 18;
      element.scrollTop += row.getBoundingClientRect().top - element.getBoundingClientRect().top - offset;
    } else element.scrollTop = element.scrollHeight;
    atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
    initialized.current = true; restore.current = false; setPositioned(true);
  }, [source, id, visible, readLoaded, firstUnreadId, thread.rows, thread.ready, thread.hasOlder, thread.loadingOlder, thread.error]);
  return { firstUnreadId, positioned: positioned && visible, remember };
}
