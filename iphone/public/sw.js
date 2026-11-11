/* Push-only service worker: deliberately no fetch handler or private-data cache. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function validEvent(value) {
  return value && /^[0-9a-f-]{36}$/i.test(value.requestId) && ['request', 'mutual', 'message', 'reminder', 'family'].includes(value.kind);
}

function routeIds(value) {
  return Object.fromEntries(['messageId', 'roomId'].filter(key => /^[0-9a-f-]{36}$/i.test(value[key] || '')).map(key => [key, value[key]]));
}

self.addEventListener('push', event => {
  let value;
  try { value = event.data?.json(); } catch { return; }
  if (!validEvent(value)) return;
  const body = {
    request: 'لديك طلب تعارف جديد. افتح وُدَين للاطلاع عليه.',
    mutual: 'تم القبول المتبادل. يمكنك بدء الحديث في وُدَين.',
    message: 'لديك رسالة جديدة في وُدَين.',
    reminder: 'لديك تذكير خاص. افتح وُدَين للاطلاع عليه.',
    family: 'لديك رسالة جديدة في جسر الأهل.',
  }[value.kind];
  event.waitUntil(self.registration.showNotification('وُدَين', {
    body, lang: 'ar', dir: 'rtl', icon: '/brand/wudayn-icon-v2.png',
    tag: value.kind + ':' + value.requestId,
    silent: value.kind === 'reminder',
    data: { requestId: value.requestId, kind: value.kind, ...routeIds(value) },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const value = event.notification.data;
  if (!validEvent(value)) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const windowClient = windows.find(client => {
      const url = new URL(client.url);
      return url.origin === self.location.origin && ['/', '/index.html'].includes(url.pathname)
        && !url.searchParams.has('family') && !url.searchParams.has('test');
    });
    if (windowClient) {
      await windowClient.focus();
      windowClient.postMessage({ type: 'nisfayn-push-open', notification: value });
    } else {
      const url = new URL('/', self.location.origin);
      url.searchParams.set('pushRequest', value.requestId);
      url.searchParams.set('pushKind', value.kind);
      for (const [key, id] of Object.entries(routeIds(value))) url.searchParams.set(key, id);
      await self.clients.openWindow(url.href);
    }
  })());
});
