import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { Camera } from '../BrandIcons';
import type { CommunitySource } from '../community/data';
import { nativePrivatePhoto } from '../community/privatePhoto';
import { captureTitle, latestChatScreenshot, watchChatScreenshots } from '../notifications/chatScreenshots';
import { nativeSession } from '../session';

const captureTime = new Intl.DateTimeFormat('ar-SA', { hour: 'numeric', minute: '2-digit' });

export function ChatScreenshotNotice({ source, requestId }: { source: CommunitySource; requestId: string }) {
  const chat = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [visibleId,setVisibleId]=useState<string|null>(null);
  const latest = useSyncExternalStore(watchChatScreenshots, () => latestChatScreenshot(source, requestId));
  const latestId=latest?.id, latestCreatedAt=latest?.createdAt;
  useEffect(()=>{
    if(!latestId||!latestCreatedAt||Date.now()-Date.parse(latestCreatedAt)>60_000){setVisibleId(null);return;}
    setVisibleId(latestId);
    const timer=window.setTimeout(()=>setVisibleId(current=>current===latestId?null:current),10_000);
    return()=>window.clearTimeout(timer);
  },[latestId,latestCreatedAt]);
  useLayoutEffect(() => {
    if (!nativePrivatePhoto() || !source.reportChatScreenshot) return;
    const context = crypto.randomUUID();
    let active = true;
    let subscription: PluginListenerHandle | undefined;
    void (async () => {
      const handle = await nativeSession.addListener('chatScreenshot', event => {
        if (!active || event.context !== context || document.hidden || !chat.current?.isConnected) return;
        if (chat.current.closest('[data-private-hidden]') || document.querySelector(
          'html[data-capture-native-hidden], html[data-capture-hidden], dialog[open], [aria-modal="true"]:not(dialog)')) return;
        void source.reportChatScreenshot!(requestId, event.eventId).catch(() => {
          if (active) setFailed(ids => ids.includes(event.eventId) ? ids : [...ids, event.eventId]);
        });
      });
      if (!active) { await handle.remove(); return; }
      subscription = handle;
      await nativeSession.setScreenshotContext({ context, active: true });
    })().catch(() => {});
    return () => {
      active = false;
      void subscription?.remove().catch(() => {});
      void nativeSession.setScreenshotContext({ context, active: false }).catch(() => {});
    };
  }, [source, requestId]);
  const retry = async () => {
    const eventId = failed[0];
    if (!eventId) return;
    try {
      await source.reportChatScreenshot!(requestId, eventId);
      setFailed(ids => ids.filter(id => id !== eventId));
    } catch { /* Keep the notice and its retry action visible. */ }
  };
  const visible=latest&&visibleId===latest.id?latest:null;
  if(!visible&&!failed.length)return <div ref={chat} hidden/>;
  return <div className="cm-chat-capture-notice" ref={chat}>
    {visible&&<p className="cm-chat-capture-event" role="status"><Camera size={14} aria-hidden="true"/><strong>{captureTitle(visible.person.alias)}</strong><time dateTime={visible.createdAt}>{captureTime.format(new Date(visible.createdAt))}</time></p>}
    {failed.length>0&&<p className="cm-chat-capture-error" role="alert">لم نتمكن من إرسال تنبيه لقطة الشاشة. <button onClick={()=>void retry()}>إعادة المحاولة</button></p>}
  </div>;
}
