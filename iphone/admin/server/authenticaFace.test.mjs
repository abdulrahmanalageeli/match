import test from 'node:test';
import assert from 'node:assert/strict';
import { compareAuthenticaFaces } from './authenticaFace.ts';

const memberId = '11111111-1111-4111-8111-111111111111';
const input = { memberId, referenceJpeg: Buffer.from([255,216,1,255,217]), cameraJpeg: Buffer.from([255,216,2,255,217]) };
const reply = result => new Response(JSON.stringify(result));
const good = matched => ({ success: true, data: { user_id: memberId, result: matched } });

test('uses documented Authentica contract without claiming liveness', async () => {
  const output = await compareAuthenticaFaces(input, { key: 'server-secret', fetcher: async (url, init) => {
    assert.equal(url, 'https://api.authentica.sa/api/v2/verify-by-face');
    assert.equal(init.headers['X-Authorization'], 'server-secret');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal);
    assert.deepEqual(JSON.parse(init.body), { user_id: memberId, registered_face_image: input.referenceJpeg.toString('base64'), query_face_image: input.cameraJpeg.toString('base64') });
    return reply(good(true));
  }});
  assert.deepEqual(output, { matched: true, liveness: 'not_verified' });
});

test('a completed comparison can still be a non-match', async () => {
  assert.deepEqual(await compareAuthenticaFaces(input, { key: 'key', fetcher: async () => reply(good(false)) }), { matched: false, liveness: 'not_verified' });
});

test('rejects missing, malformed and different-member provider results', async () => {
  for (const response of [{ success: true }, { success: false, data: good(true).data }, { success: true, data: { user_id: memberId, result: 'true' } }, { success: true, data: { user_id: 'someone-else', result: true } }]) {
    await assert.rejects(compareAuthenticaFaces(input, { key: 'key', fetcher: async () => reply(response) }), /FACE_SERVICE_UNAVAILABLE/);
  }
});

test('rejects invalid input before making a paid request', async () => {
  let calls = 0;
  const options = { key: 'key', fetcher: async () => { calls++; return reply(good(true)); } };
  for (const change of [{ memberId: 'body-user' }, { referenceJpeg: Buffer.alloc(1024 * 1024 + 1) }, { cameraJpeg: Buffer.from('not an image') }, { cameraJpeg: input.referenceJpeg }]) {
    await assert.rejects(compareAuthenticaFaces({ ...input, ...change }, options), /FACE_(INPUT_INVALID|CAPTURE_REQUIRED)/);
  }
  await assert.rejects(compareAuthenticaFaces(input, { ...options, key: '' }), /FACE_SERVICE_UNAVAILABLE/);
  assert.equal(calls, 0);
});

test('never exposes provider errors, bodies or credentials', async () => {
  for (const fetcher of [async () => { throw Error('private-provider-body'); }, async () => new Response('private-provider-body', { status: 429 }), async () => new Response('private-provider-body')]) {
    await assert.rejects(compareAuthenticaFaces(input, { key: 'server-secret', fetcher }), error => error.message === 'FACE_SERVICE_UNAVAILABLE' && !error.cause);
  }
});
