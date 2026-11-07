import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let loader, VerifiedBadge, VerificationCenter, MemberProfile, Settings, DirectoryRow, PersonCard;
before(async () => {
  loader = await createServer({
    configFile: false, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false },
    plugins: [{ name: 'verification-render-exports', transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/community/Community.tsx')) return code + '\nexport { DirectoryRow, PersonCard };';
      // Render tests must not initialize a live authentication client.
      if (id.replaceAll('\\', '/').endsWith('/src/cloud.ts')) return code.replace(/export const cloud =\s*deployment\.ready/, 'export const cloud = false');
    } }],
  });
  ({ VerifiedBadge } = await loader.ssrLoadModule('/src/verification/VerifiedBadge.tsx'));
  ({ VerificationCenter } = await loader.ssrLoadModule('/src/verification/VerificationCenter.tsx'));
  ({ MemberProfile } = await loader.ssrLoadModule('/src/profile/MemberProfile.tsx'));
  ({ Settings } = await loader.ssrLoadModule('/src/settings/Settings.tsx'));
  ({ DirectoryRow, PersonCard } = await loader.ssrLoadModule('/src/community/Community.tsx'));
});
after(() => loader?.close());
const noop = () => {};
const claim = { id: 'synthetic-claim', kind: 'marital_status', label: 'الحالة الاجتماعية', reviewedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), isTest: false };
const person = { id: 'synthetic-member', alias: 'عضو تجريبي', age: 31, city: 'الرياض', occupation: 'مهندس', bio: 'بيانات اصطناعية للاختبار', interests: [], reasons: [], manualVerifications: [claim] };
const profile = { displayName: 'عضو تجريبي', age: 31, gender: 'man', city: 'الرياض', profession: 'مهندس', bio: '', marriageBasics: { maritalStatus: 'never_married' } };
const source = { verification: async () => ({ requests: [], claims: [], isTest: true }), submitVerification: async () => ({ requests: [], claims: [], isTest: true }), verificationTestMode: true };
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
function noNestedButtons(html) {
  let depth = 0;
  for (const tag of html.match(/<\/?button\b[^>]*>/g) ?? []) {
    depth += tag.startsWith('</') ? -1 : 1;
    assert.ok(depth <= 1 && depth >= 0, 'button must not contain another button');
  }
  assert.equal(depth, 0);
}

test('badge describes its manual scope and preserves visible test distinction', () => {
  const html = render(VerifiedBadge, { claims: [claim] });
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /الحالة الاجتماعية/);
  assert.match(html, /عرض نطاق التوثيق وصلاحيته/);
  assert.doesNotMatch(html, /موثق رسميًا|حكومي/);
  assert.match(render(VerifiedBadge, { claims: [{ ...claim, isTest: true }], compact: true }), /توثيق تجريبي/);
  assert.equal(render(VerifiedBadge, { claims: [{ ...claim, expiresAt: '2000-01-01T00:00:00Z' }] }), '');
});

test('actual discovery row and portrait card contain no nested buttons with a valid claim', () => {
  for (const component of [DirectoryRow, PersonCard]) {
    const html = render(component, { person, source: {}, open: noop, request: noop, interest: noop, dismiss: noop, report: noop, busy: false });
    assert.match(html, /mv-badge-static/);
    assert.match(html, /الحالة الاجتماعية/);
    noNestedButtons(html);
  }
});

test('full profile provides an interactive scoped badge outside all other controls', () => {
  const html = render(MemberProfile, { person, source: null, back: noop, backText: 'رجوع' });
  assert.match(html, /class="mv-badge/);
  assert.match(html, /aria-haspopup="dialog"/);
  noNestedButtons(html);
});

test('document collection is unavailable for demo, testers and members while history stays accessible', () => {
  const unavailable = render(VerificationCenter, { source: {}, profile, onBack: noop });
  assert.match(unavailable, /لا يمكن إرسال مستندات من العرض التجريبي العام/);
  assert.doesNotMatch(unavailable, /type="file"/);
  const tester = render(VerificationCenter, { source, profile, onBack: noop });
  assert.match(tester, /إرسال المستندات متوقف مؤقتًا/);
  assert.match(tester, /طلباتك/);
  assert.doesNotMatch(tester, /type="file"|type="checkbox"|استكمال الطلب/);
  const member = render(VerificationCenter, { source: { ...source, verificationTestMode: false }, profile, onBack: noop });
  assert.match(member, /إرسال المستندات متوقف مؤقتًا/);
  assert.doesNotMatch(member, /type="file"/);
  noNestedButtons(tester);
});

test('Settings exposes the verification center only when the source supports it', () => {
  const props = { state: null, demo: true, demoMember: profile, paused: false, busy: false, onEdit: noop, onMembership: noop, onToggle: noop, onDelete: noop, onExit: noop, onPrivacy: noop };
  const html = render(Settings, { ...props, source });
  assert.match(html, /st-verification-entry/);
  assert.match(html, /استقبال المستندات متوقف/);
  assert.match(html, /متابعة الطلبات السابقة وسحبها/);
  noNestedButtons(html);
  assert.doesNotMatch(render(Settings, { ...props, source: {} }), /st-verification-entry/);
});
