import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { readRecoveryLink, cleanRecoveryUrl } from '../src/auth/passwordRecovery.ts';

// Execute the real entry module with UI/providers stubbed. This verifies route
// precedence and scrubbing without sending credentials or mounting live services.
async function entry(href, mode = 'production') {
  const events = [], location = new URL(href);
  let rendered;
  const context = vm.createContext({ URL, URLSearchParams, window: {
    location, history: { replaceState(_state, _title, path) { events.push(['scrub', path]); location.href = new URL(path, location).href; } },
  }, document: { documentElement: {}, getElementById: () => ({}) } });
  const jsx = (type, props) => ({ type, props });
  const modules = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-dom/client': { createRoot: () => ({ render(value) { events.push(['render']); rendered = value; } }) },
    react: { lazy: () => 'GuardianPortal', Suspense: 'Suspense' },
    './App': { default: 'App' },
    './testing/TesterGate': { TesterGate: 'TesterGate' },
    './auth/passwordRecovery': { readRecoveryLink, cleanRecoveryUrl },
    './settings/preferences': { initializeDevicePreferences: () => events.push(['preferences']) },
    './monitoring': { AppBoundary: 'AppBoundary', initializeFaultReporting: () => events.push(['monitoring']) },
    './mobile/keyboardViewport': { initializeKeyboardViewport: () => { events.push(['keyboard']); return () => {}; } },
  };
  const source = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = new vm.SourceTextModule(compiled, { context, initializeImportMeta(meta) { meta.env = { MODE: mode }; } });
  await module.link(specifier => {
    const exports = modules[specifier] ?? (specifier.endsWith('.css') ? {} : null);
    assert(exports, `Unexpected dependency ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  return { screen: rendered.props.children, events, href: location.href };
}

test('recovery takes precedence over family and demo routes and is scrubbed before initialization/render', async () => {
  for (const mode of ['production', 'demo']) {
    const result = await entry('https://app.example/?family=1&auth=recovery#type=recovery&access_token=a&refresh_token=b&invite=private', mode);
    assert.equal(result.screen.type, 'App');
    assert.deepEqual(result.screen.props.recoveryLink, { kind: 'tokens', accessToken: 'a', refreshToken: 'b' });
    assert.deepEqual(result.events[0], ['scrub', '/']);
    assert(result.events.findIndex(([event]) => event === 'keyboard') > 0);
    assert.equal(result.href, 'https://app.example/');
    assert(!result.href.includes('private'));
  }
});

test('invalid recovery callbacks still bypass the demo gate and remove URL errors/tokens', async () => {
  const result = await entry('https://app.example/?family=1&auth=recovery#error=access_denied&token_hash=secret', 'demo');
  assert.equal(result.screen.type, 'App');
  assert.deepEqual(result.screen.props.recoveryLink, { kind: 'invalid' });
  assert.equal(result.href, 'https://app.example/');
});

test('ordinary demo and family entry keep their existing routes', async () => {
  const demo = await entry('https://app.example/', 'demo');
  assert.equal(demo.screen.type, 'TesterGate');
  const family = await entry('https://app.example/?family=1#invite=family-only', 'demo');
  assert.equal(family.screen.type, 'Suspense');
  assert.equal(family.screen.props.children.type, 'GuardianPortal');
  assert.equal(family.screen.props.children.props.inviteToken, 'family-only');
  assert.equal(family.href, 'https://app.example/?family=1');
});
