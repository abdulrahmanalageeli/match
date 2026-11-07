import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let loader, SharedPassportDetails;
before(async () => {
  loader = await createServer({ configFile: false, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false } });
  ({ SharedPassportDetails } = await loader.ssrLoadModule('/src/readiness/ReadinessPassport.tsx'));
});
after(() => loader?.close());
const render = view => renderToStaticMarkup(createElement(SharedPassportDetails, { view }));
const claim = { id: 'synthetic-claim', kind: 'identity', label: 'تطابق الهوية', issuer: 'جهة اختبار خيالية', method: 'issuer_confirmation', verifiedAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', status: 'valid' };
const data = { available: true, sections: [], timeline: 'within_6_months', family: 'discussed', preparation: { communication: 'ready', budget: 'ready', housing: 'ready', responsibilities: 'ready', course: 'ready' }, claims: [claim], sharedUntil: '2099-01-01T00:00:00Z' };

test('unavailable passport never renders stale section values or claim identity', () => {
  const html = render({ ...data, available: false, sections: ['timeline', 'preparation', 'verification'] });
  assert.match(html, /لم تتم مشاركة الجواز معك حاليًا/);
  assert.doesNotMatch(html, /جهة اختبار خيالية|تطابق الهوية|خلال ٦ أشهر|الخطة المالية/);
});
test('rendering is allowlisted by shared section even when extra fields are present', () => {
  const html = render({ ...data, sections: ['timeline'] });
  assert.match(html, /خلال ٦ أشهر/);
  assert.match(html, /إفادة شخصية/);
  assert.doesNotMatch(html, /جهة اختبار خيالية|تطابق الهوية|الخطة المالية|التأهيل للزواج/);
});
test('verification presents source and scope without turning expired or revoked claims green', () => {
  const valid = render({ ...data, sections: ['verification'] });
  assert.match(valid, /جهة اختبار خيالية/);
  assert.match(valid, /تأكيد مستقل من الجهة/);
  assert.match(valid, /لا يضمن السلوك أو التوافق أو نجاح الزواج/);
  assert.match(valid, /rp-claim-current/);
  for (const changed of [{ expiresAt: '2020-01-01T00:00:00Z' }, { status: 'revoked' }]) {
    const html = render({ ...data, sections: ['verification'], claims: [{ ...claim, ...changed }] });
    assert.doesNotMatch(html, /rp-claim-current/);
    assert.match(html, /الهوية غير متحققة مستقلًا/);
  }
});
test('self-reported preparation cannot become independent verification', () => {
  const html = render({ ...data, sections: ['preparation'] });
  assert.match(html, /إفادات شخصية، وليست إثباتات مستقلة/);
  assert.doesNotMatch(html, /rp-claim-current|بيان أكدته الجهة/);
});
