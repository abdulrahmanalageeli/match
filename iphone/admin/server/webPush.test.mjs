import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createECDH } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const dataModule = source => 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64');
const apns = dataModule(await readFile(new URL('./apns.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('./webPush.ts', import.meta.url), 'utf8')).replace("'./apns.js'", JSON.stringify(apns)).replace("'web-push'", JSON.stringify(import.meta.resolve('web-push')));
const { validWebSubscription, classifyWebPush, webPushPayload, openWebPush } = await import(dataModule(source));
const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/example', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 3).toString('base64url') } };
const job = { id: randomUUID(), leaseId: randomUUID(), requestId: randomUUID(), kind: 'message', token: 'a'.repeat(32), environment: 'web', expiresAt: new Date(Date.now() + 60000).toISOString(), subscription };

test('Web Push rejects arbitrary HTTP targets, credentials, ports and malformed keys', () => {
  assert(validWebSubscription(subscription));
  for (const endpoint of ['http://fcm.googleapis.com/send/a', 'https://127.0.0.1/a', 'https://fcm.googleapis.com.evil.test/a', 'https://web.push.apple.com:444/a', 'https://user@web.push.apple.com/a', 'https://web.push.apple.com/a#secret']) {
    assert.equal(validWebSubscription({ ...subscription, endpoint }), false, endpoint);
  }
  assert.equal(validWebSubscription({ ...subscription, keys: { auth: 'x', p256dh: 'x' } }), false);
  for (const endpoint of ['https://web.push.apple.com/example', 'https://updates.push.services.mozilla.com/wpush/v2/example', 'https://wns2.notify.windows.com/example']) assert(validWebSubscription({ ...subscription, endpoint }));
});

test('Web Push uses generic encrypted payload, bounded TTL and accurate provider outcomes', async () => {
  let captured;
  const sender = openWebPush({ subject: 'mailto:support@example.com', publicKey: 'public', privateKey: 'private' }, async (...args) => { captured = args; return { statusCode: 201 }; });
  assert.equal(await sender.send({ ...job, name: 'PRIVATE NAME', body: 'PRIVATE MESSAGE' }), 'sent');
  const payload = JSON.parse(captured[1]);
  assert.deepEqual(Object.keys(payload).sort(), ['body', 'kind', 'requestId', 'title']);
  assert(!JSON.stringify(payload).includes('PRIVATE'));
  assert.equal(captured[2].contentEncoding, 'aes128gcm');
  assert(captured[2].TTL > 0 && captured[2].TTL <= 60);
  assert.equal(captured[2].timeout, 8000);
  assert.equal(await sender.send({ ...job, subscription: { ...subscription, endpoint: 'https://localhost/test' } }), 'failed');
  assert.equal(await sender.send({ ...job, expiresAt: '2000-01-01' }), 'failed');
  assert.equal(classifyWebPush(410), 'invalid'); assert.equal(classifyWebPush(404), 'invalid');
  assert.equal(classifyWebPush(403), 'failed'); assert.equal(classifyWebPush(302), 'failed');
  assert.equal(classifyWebPush(503), 'retry'); assert.equal(classifyWebPush(429), 'retry');
  assert.equal(await openWebPush({}, async () => { throw { statusCode: 410, body: 'DO NOT LOG' }; }).send(job), 'invalid');
  assert.throws(() => webPushPayload({ requestId: 'bad', kind: 'message' }));
});
