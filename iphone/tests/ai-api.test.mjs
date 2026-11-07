import test from 'node:test';
import assert from 'node:assert/strict';
import { createAIService, parseInput, completionRequest, outputText, PROJECT_URL, PUBLISHABLE_KEY } from '../api/_lib/ai.mjs';
import handler from '../api/ai.mjs';

const session = 'a'.repeat(64), owner = 'b'.repeat(64);
const opener = { mode: 'opener' };
const reply = { mode: 'demo_reply', personaId: 'p01', messages: [{ role: 'user', content: 'كيف تقضي نهاية الأسبوع؟' }] };
const generated = 'أحب أطلع أمشي وأرتب وقت للقراءة. وأنت؟';
const completion = { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text: generated }) } }] };
function harness(options = {}) {
  const network = [], requests = []; let revoked = false;
  const service = createAIService({
    env: options.env || { OPENAI_API_KEY: 'server-key' },
    fetcher: async (url, init) => {
      const body = JSON.parse(init.body); network.push({ url, init, body });
      if (revoked || options.unauthorized) return Response.json({ code: '42501' }, { status: 403 });
      return Response.json(body.reserve ? { status: options.limited ? 'limited' : 'allowed' } : { owner });
    },
    clientFactory: config => {
      assert.equal(config.apiKey, 'server-key');
      return { chat: { completions: { create: async (request, runtime) => {
        requests.push({ request, runtime });
        if (options.failure) throw new Error('provider timeout with private diagnostic');
        return completion;
      } } } };
    },
  });
  return { service, network, requests, revoke: () => { revoked = true; } };
}

test('AI accepts only a generic opener with no personal-data fields', () => {
  assert.deepEqual(parseInput(opener), opener);
  for (const invalid of [
    { ...opener, messages: [] }, { ...opener, profile: { bio: 'PRIVATE BIO', interests: ['PRIVATE INTEREST'] } },
    { ...opener, profile: {} }, { ...opener, text: 'PRIVATE TEXT' }, { ...opener, user: 'PRIVATE USER' }, {},
  ]) assert.throws(() => parseInput(invalid), error => error.status === 400);
});

test('old profile openers and all transcript replies fail closed before any network call', async () => {
  const h = harness();
  for (const input of [reply, { ...reply, messages: [] }, { ...opener, profile: { bio: 'PRIVATE BIO', interests: [] } }]) {
    for (const headers of [{ 'x-test-session': session }, { authorization: 'Bearer valid.jwt.signature' }]) {
      await assert.rejects(h.service(input, headers), e => [400, 403].includes(e.status));
    }
    assert.throws(() => completionRequest(input, 'gpt-5.4-mini'));
  }
  assert.equal(h.network.length, 0); assert.equal(h.requests.length, 0);
});

test('provider receives only static generic instructions and no member/session metadata', async () => {
  const h = harness();
  await h.service(opener, { authorization: 'Bearer valid.jwt.signature' });
  const request = h.requests[0].request;
  assert.equal(request.store, false); assert.equal(request.max_completion_tokens, 300);
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(request.messages.length, 2); assert.equal(request.messages[1].role, 'user');
  assert.equal(request.tools, undefined);
  assert.match(request.messages[0].content, /لا توجد بيانات عن أي شخص/);
  assert.equal(request.messages[1].content, 'اقترح بداية عامة ومحترمة للتعارف الجاد.');
  assert.doesNotMatch(JSON.stringify(request), /valid\.jwt|PRIVATE|publicProfile|transcript|personaId/);
  assert.equal(request.user, undefined); assert.equal(request.metadata, undefined);
});

test('missing credentials and missing authentication never call OpenAI', async () => {
  const noKey = harness({ env: {} });
  await assert.rejects(noKey.service(opener, { 'x-test-session': session }), e => e.status === 503);
  assert.equal(noKey.network.length, 0); assert.equal(noKey.requests.length, 0);
  const h = harness();
  await assert.rejects(h.service(opener), e => e.status === 401);
  await assert.rejects(h.service(opener, { 'x-test-session': 'forged' }), e => e.status === 401);
  assert.equal(h.requests.length, 0);
});

test('live authentication failure and quota limit both prevent provider cost', async () => {
  for (const options of [{ unauthorized: true }, { limited: true }]) {
    const h = harness(options);
    await assert.rejects(h.service(opener, { 'x-test-session': session }), e => e.status === (options.limited ? 429 : 401));
    assert.equal(h.requests.length, 0);
  }
});

test('same request is cached only within an authenticated owner and checks revocation on reuse', async () => {
  const h = harness();
  const first = await h.service(opener, { 'x-test-session': session });
  const second = await h.service(opener, { 'x-test-session': session });
  assert.equal(first.cached, false); assert.equal(second.cached, true);
  assert.equal(second.text, generated); assert.equal(h.requests.length, 1);
  assert.equal(h.network.filter(n => n.body.reserve).length, 1);
  assert.equal(h.network.filter(n => !n.body.reserve).length, 2);
  h.revoke(); await assert.rejects(h.service(opener, { 'x-test-session': session }), e => e.status === 401);
  assert.equal(h.requests.length, 1);
  for (const call of h.network) {
    assert.equal(call.url, PROJECT_URL + '/rest/v1/rpc/nisfayn_ai_allow');
    assert.equal(call.init.headers.apikey, PUBLISHABLE_KEY);
    assert.equal(call.init.headers.Authorization, undefined);
    assert.equal(call.body.member_id, undefined);
  }
});

test('real JWT is passed only to the checked Supabase RPC; real-account simulation is rejected', async () => {
  const h = harness();
  await h.service(opener, { authorization: 'Bearer valid.jwt.signature' });
  assert.equal(h.network[0].init.headers.Authorization, 'Bearer valid.jwt.signature');
  assert.equal(h.network[0].body.test_token, '');
  await assert.rejects(h.service(reply, { authorization: 'Bearer valid.jwt.signature' }), e => e.status === 403);
  assert.equal(h.requests.length, 1);
});

test('provider failure is bounded and returns no raw diagnostic or fabricated AI answer', async () => {
  const h = harness({ failure: true });
  await assert.rejects(h.service(opener, { 'x-test-session': session }), e => e.status === 503 && !e.message.includes('private diagnostic'));
  assert.equal(h.requests[0].runtime.timeout, 12000);
  assert.equal(h.requests[0].runtime.maxRetries, 0);
});

test('malformed, refused, oversized or link-bearing outputs cannot be presented as AI suggestions', () => {
  assert.equal(outputText(completion), generated);
  for (const value of [
    { choices: [{ finish_reason: 'length', message: { content: '{' } }] },
    { choices: [{ finish_reason: 'stop', message: { refusal: 'no' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text: 'a'.repeat(451) }) } }] },
    { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text: 'https://example.com' }) } }] },
    { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text: 'hi', action: 'accept' }) } }] },
  ]) assert.throws(() => outputText(value), e => e.status === 503);
});

function responseRecorder() {
  return { headers: {}, statusCode: 200, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

test('native Capacitor preflight and POST errors retain narrowly scoped CORS without credentials', async () => {
  for (const origin of ['capacitor://localhost', 'http://localhost']) {
    const res = responseRecorder();
    await handler({ method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type, authorization, x-test-session' } }, res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['Access-Control-Allow-Origin'], origin);
    assert.equal(res.headers.Vary, 'Origin');
    assert.equal(res.headers['Access-Control-Allow-Credentials'], undefined);
    const post = responseRecorder();
    await handler({ method: 'POST', headers: { origin }, body: {} }, post);
    assert.equal(post.statusCode, 400);
    assert.equal(post.headers['Access-Control-Allow-Origin'], origin);
  }
});

test('CORS rejects arbitrary origins, localhost lookalikes, methods and unexpected headers', async () => {
  for (const change of [
    { origin: 'https://example.com' }, { origin: 'http://localhost.evil.test' },
    { origin: 'http://localhost:3000' }, { origin: 'null' },
    { 'access-control-request-method': 'DELETE' }, { 'access-control-request-headers': 'x-admin-secret' },
  ]) {
    const res = responseRecorder();
    await handler({ method: 'OPTIONS', headers: { origin: 'capacitor://localhost', 'access-control-request-method': 'POST', ...change } }, res);
    assert.equal(res.statusCode, 403);
    if (change.origin) assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(res.headers['Access-Control-Allow-Credentials'], undefined);
  }
});
