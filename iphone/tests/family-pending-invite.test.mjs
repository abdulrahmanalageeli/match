import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = ts.transpileModule(await readFile(new URL('../src/family/pendingInvite.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace("'./model'", JSON.stringify(new URL('../src/family/model.ts', import.meta.url).href));
const { rememberFamilyInvite, restoreFamilyInvite, forgetFamilyInvite, pendingFamilyInviteKey, pendingFamilyInviteLifetime } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const memory = () => { const rows = new Map(); return { rows, getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) }; };
test('one-use invitation survives an email tab for thirty minutes without storing authentication or identity', () => {
  const storage = memory(), token = 'ab'.repeat(32), now = 1000;
  rememberFamilyInvite(token, storage, now);
  assert.equal(restoreFamilyInvite(storage, now + 1), token);
  assert.deepEqual(Object.keys(JSON.parse(storage.rows.get(pendingFamilyInviteKey))).sort(), ['expiresAt','token']);
  assert.equal(restoreFamilyInvite(storage, now + pendingFamilyInviteLifetime), '');
  assert.equal(storage.rows.size, 0);
});
test('claim/ignore/logout clearing and corrupt or unbounded values fail closed', () => {
  const storage = memory(), token = 'ab'.repeat(32);
  rememberFamilyInvite(token, storage, 1000); forgetFamilyInvite(storage);
  assert.equal(restoreFamilyInvite(storage, 1001), '');
  for (const value of ['not-json', JSON.stringify({ token: 'invalid', expiresAt: 2000 }), JSON.stringify({ token, expiresAt: 9999999999999 })]) {
    storage.rows.set(pendingFamilyInviteKey, value); assert.equal(restoreFamilyInvite(storage, 1001), ''); assert.equal(storage.rows.size, 0);
  }
  rememberFamilyInvite('short', storage, 1000); assert.equal(storage.rows.size, 0);
});
