import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function browser({ permission = 'default', account = 'member-a', previousOwner, ios = false } = {}) {
 const calls = [], listeners = new Map(), store = new Map(previousOwner ? [['nisfayn.web-push.owner', previousOwner]] : []), pending = new Map();
 const subscription = { options: {}, toJSON: () => ({ endpoint: 'https://web.push.apple.com/test', keys: { auth: 'a', p256dh: 'b' } }), unsubscribe: async () => { calls.push('unsubscribe'); return true; } };
 const registration = { pushManager: { getSubscription: async () => null, subscribe: async options => { calls.push(['subscribe', options]); return subscription; } }, getNotifications: async () => [] };
 const serviceWorker = { register: async () => registration, ready: Promise.resolve(registration), getRegistration: async () => registration, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener() {} };
 const document = { hidden: false, addEventListener() {}, removeEventListener() {} };
 const Notification = { permission, requestPermission() { calls.push('permission'); this.permission = 'granted'; return Promise.resolve('granted'); } };
 const context = { exports: {}, console, Uint8Array, URL, Promise, atob: value => Buffer.from(value, 'base64').toString('binary'), crypto: { randomUUID: () => '11111111-1111-1111-1111-111111111111' },
  navigator: { userAgent: ios ? 'iPhone' : 'Chrome', platform: ios ? 'iPhone' : 'Win32', maxTouchPoints: 0, serviceWorker },
  window: { isSecureContext: true, PushManager: {}, Notification, matchMedia: () => ({ matches: false }) }, Notification, document,
  localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
  sessionStorage: { getItem: key => pending.get(key) ?? null, setItem: (key, value) => pending.set(key, value), removeItem: key => pending.delete(key) },
  location: { href: 'https://example.test/' }, history: { state: null, replaceState() {} },
  require: name => { assert.equal(name, '../cloud'); return { cloudSessionId: async () => { calls.push('session'); return account; }, callRpc: async (name, payload, owner) => { calls.push([name, payload, owner]); return { enabled: payload.enabled ?? true }; } }; },
 };
 const source = readFileSync(new URL('../src/notifications/webPush.ts', import.meta.url), 'utf8')
  .replace('import.meta.env.VITE_MARRIAGE_WEB_PUSH_PUBLIC_KEY', JSON.stringify('B'.repeat(87)))
  .replace('import.meta.env.VITE_MARRIAGE_WEB_PUSH_ENABLED', JSON.stringify('true'));
 vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
 return { api: context.exports, calls, Notification, context, listeners, pending };
}

test('browser push asks permission from the click before awaits, binds session, and enables only after registration', async () => {
 const { api, calls } = browser();
 const pending = api.enableWebPush('member-a');
 assert.equal(calls[0], 'permission');
 await pending;
 const rpc = calls.filter(Array.isArray).map(call => call[0]);
 assert.deepEqual(rpc, ['subscribe', 'marriage_web_push_register', 'marriage_push_enable']);
 const request = calls.find(call => Array.isArray(call) && call[0] === 'subscribe')[1];
 assert.equal(request.userVisibleOnly, true); assert.equal(request.applicationServerKey.length, 65);
 const denied = browser({ account: 'other' });
 await assert.rejects(denied.api.enableWebPush('member-a'), /سجّل الدخول/);
 assert(!denied.calls.some(call => Array.isArray(call) && call[0] === 'subscribe'));
});

test('iPhone Safari explains home-screen requirement and disable revokes server before local subscription', async () => {
 const iphone = browser({ ios: true });
 assert.equal(iphone.api.needsHomeScreen(), true);
 await assert.rejects(iphone.api.enableWebPush('member-a'), /الشاشة الرئيسية/);
 assert.deepEqual(iphone.calls, []);
 const { api, calls } = browser();
 await api.disableWebPush('member-a');
 assert.deepEqual(calls.filter(Array.isArray).map(call => call[0]), ['marriage_push_enable', 'marriage_push_unregister']);
});

test('notification tap survives session restoration and is consumed only for the signed-in account', async () => {
 const { api, listeners, pending } = browser();
 const event = { requestId: '11111111-1111-1111-1111-111111111111', kind: 'message' };
 listeners.get('message')({ data: { type: 'nisfayn-push-open', notification: event } });
 assert.equal(pending.size, 1);
 const opened = [];
 const stop = api.monitorWebPush('member-a', value => opened.push(value.requestId));
 await new Promise(resolve => setTimeout(resolve, 0));
 assert.deepEqual(opened, [event.requestId]); assert.equal(pending.size, 0);
 stop();
});

test('service worker shows only generic notifications and opens only same-origin valid requests', async () => {
 const handlers = new Map(), shown = [], opened = [], messages = [];
 let windows = [];
 const self = { location: { origin: 'https://nisfayn.example' }, addEventListener: (name, fn) => handlers.set(name, fn),
  registration: { showNotification: async (...args) => shown.push(args) },
  clients: { matchAll: async () => windows, openWindow: async url => opened.push(url), claim: async () => {} }, skipWaiting: async () => {} };
 vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, URL });
 assert.equal(handlers.has('fetch'), false);
 const item = { requestId: '11111111-1111-1111-1111-111111111111', kind: 'message', body: 'PRIVATE MESSAGE', url: 'https://evil.test' };
 let work;
 handlers.get('push')({ data: { json: () => item }, waitUntil: promise => { work = promise; } }); await work;
 assert.equal(shown.length, 1); assert(!JSON.stringify(shown).includes('PRIVATE')); assert(!JSON.stringify(shown).includes('evil'));
 const click = { notification: { data: item, close() {} }, waitUntil: promise => { work = promise; } };
 handlers.get('notificationclick')(click); await work;
 assert.equal(new URL(opened[0]).origin, self.location.origin); assert.equal(new URL(opened[0]).searchParams.get('pushRequest'), item.requestId);
 windows = [{ url: self.location.origin + '/', focus: async () => {}, postMessage: message => messages.push(message) }];
 handlers.get('notificationclick')(click); await work;
 assert.equal(messages[0].notification.requestId, item.requestId);
 windows = [{ url: self.location.origin + '/?family=1', focus: async () => { throw new Error('must not open family tab'); }, postMessage() {} },
  { url: self.location.origin + '/?test=1', focus: async () => { throw new Error('must not open testing tab'); }, postMessage() {} }];
 handlers.get('notificationclick')(click); await work;
 assert.equal(opened.length, 2); assert.equal(new URL(opened[1]).pathname, '/');
 assert.equal(new URL(opened[1]).searchParams.has('family'), false); assert.equal(new URL(opened[1]).searchParams.has('test'), false);
 handlers.get('push')({ data: { json: () => ({ requestId: 'bad', kind: 'message' }) }, waitUntil() { throw new Error('must not notify'); } });
 assert.equal(shown.length, 1);
});
