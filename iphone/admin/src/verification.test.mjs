import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('./Verification.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText
  .replace(/import\s*\{\s*friendly\s*\}\s*from ['"]\.\/client['"];?/, 'const friendly = error => error.message;')
  .replace(/import ['"]\.\/verification\.css['"];?/, '')
  .replace(/from ['"](react(?:\/jsx-runtime)?|lucide-react)['"]/g, (_, name) => `from ${JSON.stringify(pathToFileURL(require.resolve(name)).href)}`);
const { VerificationAdmin, VerificationSummary, verificationActions } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('verification review actions respect owner/reviewer roles and valid request lifecycle', () => {
  for (const role of ['owner', 'reviewer']) {
    assert.deepEqual(verificationActions(role, 'pending'), ['approve', 'request_changes', 'reject']);
    for (const status of ['approved', 'expired']) assert.deepEqual(verificationActions(role, status), ['revoke']);
    for (const status of ['draft', 'changes_requested', 'withdrawn', 'revoked', 'rejected', 'stale']) assert.deepEqual(verificationActions(role, status), []);
  }
  for (const status of ['pending', 'approved', 'expired', 'stale']) assert.deepEqual(verificationActions('moderator', status), []);
  const markup = renderToStaticMarkup(createElement(VerificationAdmin, { role: 'moderator', api: {}, refresh: 0, onError() {} }));
  assert.match(markup, /متاحة للمالك ومراجع العضوية فقط/);
  assert.doesNotMatch(markup, /af-search|av-claim|المستندات المقدمة/);
});

test('manual review scope and submitted marital claim are explicit without leaking unknown private fields', () => {
  const row = { memberName: 'عضوة', kind: 'marital_status', status: 'pending', submittedAt: '2026-11-07T12:00:00Z', claimSnapshot: { maritalStatus: 'divorced', currentWives: 0, nationalId: 'PRIVATE_ID_CANARY', messages: 'PRIVATE_CHAT_CANARY' }, isDummy: false, isTest: false };
  const markup = renderToStaticMarkup(createElement(VerificationSummary, { row }));
  assert.match(markup, /الحالة الاجتماعية/); assert.match(markup, /مطلق \/ مطلقة/); assert.match(markup, /عدد الزوجات حاليًا/);
  assert.match(markup, /لا تعني توثيقًا حكوميًا/);
  assert.doesNotMatch(markup, /PRIVATE_ID_CANARY|PRIVATE_CHAT_CANARY/);
  const testMarkup = renderToStaticMarkup(createElement(VerificationSummary, { row: { ...row, isTest: true, status: 'approved' } }));
  assert.match(testMarkup, /وهمي · Dummy/); assert.match(testMarkup, /لا يمثّل تحققًا حقيقيًا/);
});
