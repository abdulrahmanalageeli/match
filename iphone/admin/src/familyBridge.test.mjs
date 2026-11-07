import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('./FamilyBridge.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText
  .replace(/import\s*\{\s*friendly\s*\}\s*from ['"]\.\/client['"];?/, 'const friendly = error => error.message;')
  .replace(/from ['"](react(?:\/jsx-runtime)?|lucide-react)['"]/g, (_, name) => `from ${JSON.stringify(pathToFileURL(require.resolve(name)).href)}`);
const { FamilyBridgeAdmin, FamilyLinkSummary, familyReviewActions } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('family decisions are visible only to owner/reviewer with valid status transitions', () => {
  for (const role of ['owner', 'reviewer']) {
    assert.deepEqual(familyReviewActions(role, 'pending'), ['approve', 'reject']);
    assert.deepEqual(familyReviewActions(role, 'approved'), ['revoke']);
    assert.deepEqual(familyReviewActions(role, 'rejected'), ['approve']);
  }
  for (const status of ['pending', 'approved', 'rejected']) assert.deepEqual(familyReviewActions('moderator', status), []);
  const markup = renderToStaticMarkup(createElement(FamilyBridgeAdmin, { role: 'moderator', api: {}, refresh: 0, onError() {} }));
  assert.match(markup, /متاحة للمالك ومراجع العضوية/);
  assert.doesNotMatch(markup, /af-search|detail-sheet|طلبات ربط الأهل/);
});

test('review summary separates member consent from admin approval and omits unknown private fields', () => {
  const markup = renderToStaticMarkup(createElement(FamilyLinkSummary, { row: { guardianName: 'أهل تجريبيون', memberName: 'عضوة تجريبية', relationship: 'والدة', memberStatus: 'pending', adminReview: 'approved', reviewedAt: '2026-11-07T10:00:00Z', memberApprovedAt: null, messages: 'PRIVATE_MESSAGE_CANARY', token: 'INVITE_SECRET_CANARY', recoveryCode: 'RECOVERY_SECRET_CANARY' } }));
  assert.match(markup, /بانتظار العضو/);
  assert.match(markup, /معتمدة إداريًا/);
  assert.match(markup, /لا يكتمل الربط دون قبوله/);
  assert.doesNotMatch(markup, /PRIVATE_MESSAGE_CANARY|INVITE_SECRET_CANARY|RECOVERY_SECRET_CANARY/);
});
