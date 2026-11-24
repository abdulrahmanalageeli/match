import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { LockKeyhole } from '../BrandIcons';
import type { CommunitySource } from '../community/data';
import { nativePrivatePhoto } from '../community/privatePhoto';
import { captureTitle, latestChatScreenshot, watchChatScreenshots } from '../notifications/chatScreenshots';
import { nativeSession } from '../session';

const captureTime = new Intl.DateTimeFormat('ar', { dateStyle: 'short', timeStyle: 'short' });

export function ChatScreenshotNotice({ source, requestId }: { source: CommunitySource; requestId: string }) {
  const chat = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const latest = useSyncExternalStore(watchChatScreenshots, () => latestChatScreenshot(source, requestId));
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
    })().catch(() => { if (active) setUnavailable(true); });
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
  return <div className="cm-chat-capture-notice" ref={chat}>
    <LockKeyhole size={14} aria-hidden="true"/>
    <div>
      <span>{unavailable ? 'حدّث تطبيق الآيفون لتفعيل تنبيهات لقطات الشاشة.' : 'عند رصد لقطة شاشة في تطبيق الآيفون، يُنبَّه الطرف الآخر. لقطات المتصفح لا تُرصَد.'}</span>
      {latest && <p><strong>{captureTitle(latest.person.alias)}</strong><time dateTime={latest.createdAt}>{captureTime.format(new Date(latest.createdAt))}</time></p>}
      {failed.length > 0 && <p role="alert">تعذّر تأكيد إرسال تنبيه اللقطة. <button onClick={() => void retry()}>إعادة المحاولة</button></p>}
    </div>
  </div>;
}
