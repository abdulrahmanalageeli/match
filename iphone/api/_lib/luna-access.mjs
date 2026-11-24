import { PROJECT_URL, PUBLISHABLE_KEY } from './ai.mjs';
import { containsRestrictedText, lunaRequest } from './luna-safety.mjs';

class LunaAccessError extends Error {
  constructor(status, code, message, retryAfter) {
    super(message); Object.assign(this, { status, code, retryAfter });
  }
}
const unavailable = () => new LunaAccessError(503, 'luna_unavailable', 'تعذّر التحقق من إتاحة لونا الآن. حاول لاحقًا.');
const unauthorized = () => new LunaAccessError(401, 'unauthorized', 'سجّل الدخول مجددًا لاستخدام لونا.');
const invalid = () => new LunaAccessError(400, 'invalid_request', 'تحقق من طلب المساعدة.');
const manualInterview = new Set(['load','delete','draft','start','resume','confirm','structuredConfirm','directConfirm','profileConfirm']);

export function protectLunaEndpoint(surface, service, maxBytes, fetcher = (...args) => fetch(...args)) {
  return async (raw, headers = {}) => {
    if (Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw) ?? '') > maxBytes) {
      throw new LunaAccessError(413, 'too_large', 'الطلب أطول من المسموح.');
    }
    let body = raw;
    if (typeof raw === 'string') {
      try { body = JSON.parse(raw); } catch { throw invalid(); }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
    // These operations never generate text. Members retain access to their own
    // drafts, manual choices, consent controls and deletion during a lockout.
    if ((surface === 'interview' && manualInterview.has(body.action)) ||
        (surface === 'ai' && !['opener','simulation_reply'].includes(body.mode))) {
      return lunaRequest.run({ modelDisabled: true }, () => service(body, headers));
    }
    const bearer = headers.authorization ?? '', tester = headers['x-test-session'] ?? '';
    if (tester ? (bearer || !['ai','interview'].includes(surface) || !/^[a-f0-9]{64}$/.test(tester)) :
      (!/^Bearer [A-Za-z0-9_.-]+$/.test(bearer) || bearer.length > 6000)) throw unauthorized();
    let submitted;
    if (surface === 'search') submitted = [body.query, body.filters];
    if (surface === 'interview') submitted = [body.answer, body.priorAnswer, body.profileContext];
    if (surface === 'ai' && Array.isArray(body.messages)) submitted = body.messages.at(-1)?.body;
    async function check(refused) {
      let result;
      try {
        const response = await fetcher(PROJECT_URL + '/rest/v1/rpc/wudayn_luna_guard', {
          method: 'POST', headers: { apikey: PUBLISHABLE_KEY, ...(bearer && { Authorization: bearer }), 'Content-Type': 'application/json' },
          body: JSON.stringify({ test_token: tester || null, refused }), signal: AbortSignal.timeout(6000),
        });
        if (response.status === 401 || response.status === 403) throw unauthorized();
        if (!response.ok) throw unavailable();
        result = await response.json();
      } catch (error) { throw error instanceof LunaAccessError ? error : unavailable(); }
      if (result?.status === 'locked' && Number.isInteger(result.retryAfter) && result.retryAfter > 0) {
        const minutes = Math.ceil(result.retryAfter / 60).toLocaleString('ar-SA');
        throw new LunaAccessError(429, 'luna_locked', 'توقف استخدام لونا مؤقتًا بسبب تكرار الطلبات المحظورة. تقدر ترجع بعد ' + minutes + ' دقيقة. باقي حسابك متاح.', result.retryAfter);
      }
      if (refused && result?.status === 'warning' && [1,2].includes(result.remaining)) {
        const warning = result.remaining === 1 ? 'هذا آخر تنبيه قبل إيقاف لونا لمدة ٢٤ ساعة.' : 'تكرار الطلب يوقف استخدام لونا مؤقتًا.';
        throw new LunaAccessError(403, 'luna_warning', 'لونا تحافظ على خصوصية الأعضاء وتعليماتها الداخلية. ' + warning);
      }
      if (refused || result?.status !== 'allowed') throw unavailable();
    }
    await check(containsRestrictedText(submitted));
    const scope = { refusal: null };
    try {
      return await lunaRequest.run(scope, () => service(body, headers));
    } finally {
      if (scope.refusal === 'restricted_request' && submitted &&
          (surface === 'search' || Boolean(body.answer) || (surface === 'ai' && body.messages?.at(-1)?.senderIsMe === true))) await check(true);
      if (scope.refusal) throw new LunaAccessError(422, 'luna_withheld', 'تعذّر استخدام هذا المحتوى بأمان. جرّب سؤالًا عن التعارف أو التوافق.');
    }
  };
}
export function sendLunaAccessError(error, res) {
  if (!(error instanceof LunaAccessError)) return false;
  if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
  res.status(error.status).json({ code: error.code, error: error.message });
  return true;
}
