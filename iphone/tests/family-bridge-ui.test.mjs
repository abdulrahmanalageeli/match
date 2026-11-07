import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
let loader, FamilyRoomSummary, FamilyConnectionCode, FamilyLinkRequestForm, FamilyLinkSummary, FamilyNextAction;
before(async () => {
  loader = await createServer({ configFile: false, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false } });
  ({ FamilyRoomSummary, FamilyConnectionCode, FamilyLinkRequestForm, FamilyLinkSummary, FamilyNextAction } = await loader.ssrLoadModule('/src/family/FamilyBridge.tsx'));
});
after(() => loader?.close());
const member = { id: 'a', name: 'عضو تجريبي', role: 'member', accepted: true };
const family = { id: 'b', name: 'والد تجريبي', role: 'family', accepted: false };
const room = { id: 'room', title: 'لقاء الأسرة', status: 'pending', participants: [member, family], needsApproval: false, needsAcceptance: false, canRead: false, canSend: false, unread: 3, connectionId: 'synthetic', createdAt: '2026-11-07T00:00:00Z' };
const render = (value, extra = {}) => renderToStaticMarkup(createElement(FamilyRoomSummary, { room: value, onOpen() {}, onApprove() {}, onAccept() {}, ...extra }));
test('room approval displays the exact roster and never exposes messages or an open control', () => {
  const html = render({ ...room, needsApproval: true });
  assert.match(html, /عضو تجريبي/); assert.match(html, /والد تجريبي/); assert.match(html, /أوافق على المشاركين/);
  assert.match(html, /موافقتك تخص هذه المساحة وهؤلاء المشاركين فقط/);
  assert.doesNotMatch(html, /فتح المحادثة|رسائل غير مقروءة/);
});
test('guardian invitation requires acceptance with clear separate-room scope', () => {
  const html = render({ ...room, needsAcceptance: true });
  assert.match(html, /قبول الدعوة/); assert.match(html, /المساحة وحدها/); assert.doesNotMatch(html, /فتح المحادثة/);
});
test('a managing member outside the roster has no read or unread affordance', () => {
  const html = render({ ...room, status: 'active' });
  assert.match(html, /لست ضمن المشاركين/); assert.doesNotMatch(html, /فتح المحادثة|رسائل غير مقروءة/);
});
test('an authorized active participant gets open and unread affordances', () => {
  const html = render({ ...room, status: 'active', canRead: true, canSend: true });
  assert.match(html, /فتح المحادثة/); assert.match(html, /3 رسائل غير مقروءة/);
});
test('personal departure is distinguished from a closed room and hides chat access', () => {
  const html = render({ ...room, status: 'active', leftByMe: true, participants: [member, { ...family, accepted: true, left: true }] });
  assert.match(html, /غادرت هذه المساحة/); assert.match(html, /غادر المساحة/); assert.match(html, /العودة تحتاج مساحة جديدة/);
  assert.doesNotMatch(html, /فتح المحادثة|لست ضمن المشاركين|رسائل غير مقروءة/);
});
test('a second pending relative does not hide the ready named relationship', () => {
  const state = { links: [
    { id: 'pending', status: 'pending', adminReview: 'pending', memberName: 'اسم غير جاهز', familyName: 'قريب قيد المراجعة' },
    { id: 'ready', status: 'active', adminReview: 'approved', memberName: 'عضو جاهز', familyName: 'قريب جاهز' },
  ], rooms: [] };
  for (const guardian of [false, true]) {
    const html = renderToStaticMarkup(createElement(FamilyNextAction, { state, guardian }));
    assert.match(html, guardian ? /عضو جاهز/ : /قريب جاهز/);
    assert.match(html, /الروابط الأخرى قيد المراجعة لا تمنع استخدام الربط الجاهز/);
    assert.doesNotMatch(html, /طلب الربط قيد المراجعة<\/h2>/);
  }
});
test('member connection code is readable, copyable, and separate from a government identifier', () => {
  const html = renderToStaticMarkup(createElement(FamilyConnectionCode, { code: 'ABCD2345EFGH', onCopy() {} }));
  assert.match(html, /ABCD-2345-EFGH/); assert.match(html, /رمز ربط العضو/); assert.match(html, /نسخ رمز الربط/);
  assert.match(html, /readonly="" dir="ltr"/i); assert.doesNotMatch(html, /qr|https:/);
});
test('guardian independently submits a short member code and still needs member acceptance', () => {
  const renderForm = value => renderToStaticMarkup(createElement(FamilyLinkRequestForm, { value, onChange() {}, onSubmit() {} }));
  const incomplete = renderForm('ABCD');
  assert.match(incomplete, /ليس رقم الهوية الوطنية/); assert.match(incomplete, /ليقبل الربط أو يرفضه/);
  assert.match(incomplete, /مراجعة الإدارة واعتمادها/);
  assert.match(incomplete, /disabled=""/);
  const complete = renderForm('abcd-2345-efgh');
  assert.match(complete, /إرسال طلب الربط/); assert.doesNotMatch(complete, /disabled=""/);
});
const familyLink = { id: 'link', memberName: 'عضو تجريبي', familyName: 'والد تجريبي', relationship: 'father', status: 'pending', adminReview: 'pending', owner: true };
const renderLink = (overrides = {}, props = {}) => renderToStaticMarkup(createElement(FamilyLinkSummary, { link: { ...familyLink, ...overrides }, onApprove() {}, onRevoke() {}, ...props }));
test('member acceptance does not present an administratively pending family link as ready', () => {
  const pending = renderLink({ status: 'active' });
  assert.match(pending, /موافقة العضو محفوظة/); assert.match(pending, /بانتظار مراجعة الإدارة/); assert.doesNotMatch(pending, /ربط جاهز/);
  const approvedFirst = renderLink({ adminReview: 'approved' });
  assert.match(approvedFirst, /اعتمدت الإدارة الربط/); assert.match(approvedFirst, /بانتظار موافقة العضو/); assert.doesNotMatch(approvedFirst, /ربط جاهز/);
  assert.match(approvedFirst, /قبول/); assert.match(approvedFirst, /رفض/);
  assert.match(renderLink({ status: 'active', adminReview: 'approved' }), /ربط جاهز/);
});
test('declined review exposes only a generic status and retains withdrawal without private admin notes', () => {
  const html = renderLink({ status: 'active', adminReview: 'rejected', owner: false, adminNotes: 'INTERNAL_REVIEW_SECRET', rejectionReason: 'PRIVATE_REASON' }, { guardian: true });
  assert.match(html, /لم تعتمد الإدارة الربط/); assert.match(html, /إلغاء ربط/);
  assert.doesNotMatch(html, /INTERNAL_REVIEW_SECRET|PRIVATE_REASON|ربط جاهز|fb-link-accept/);
});
