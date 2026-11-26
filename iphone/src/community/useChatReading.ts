import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { CommunitySource } from './data';

export function useChatReading(source: CommunitySource, id: string, log: RefObject<HTMLDivElement | null>,
  atBottom: RefObject<boolean>, thread: { ready: boolean }, visible: boolean) {
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [positioned, setPositioned] = useState(false);
  const restore = useRef(true);
  // Retain the position only for a temporary panel in this open conversation.
  const panelScroll = useRef<number | null>(null);
  function remember() {
    if (log.current) panelScroll.current = atBottom.current ? null : log.current.scrollTop;
  }
  useLayoutEffect(() => {
    let active = true;
    restore.current = true;
    panelScroll.current = null;
    setPositioned(false);
    setFirstUnreadId(null);
    if (source.readState) void source.readState(id).then(value => {
      if (active) setFirstUnreadId(value.firstUnreadId);
    }).catch(() => {});
    return () => { active = false; };
  }, [source, id]);
  useLayoutEffect(() => {
    if (!visible) { restore.current = true; return; }
    const element = log.current;
    if (!element || !thread.ready || !restore.current) return;
    element.scrollTop = panelScroll.current ?? element.scrollHeight;
    atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
    restore.current = false;
    setPositioned(true);
  }, [source, id, visible, thread.ready, log, atBottom]);
  return { firstUnreadId, positioned: positioned && visible, remember };
}
