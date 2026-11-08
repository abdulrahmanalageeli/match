import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { readRecoveryLink, cleanRecoveryUrl } from '../src/auth/passwordRecovery.ts';
import { readSignupReturn } from '../src/auth/signupReturn.ts';

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
    './auth/signupReturn': { readSignupReturn },
    './community/ConnectionNotice': { ConnectionNotice: 'ConnectionNotice' },
    './settings/preferences': { initializeDevicePreferences: () => events.push(['preferences']) },
    './monitoring': { AppBoundary: 'AppBoundary', initializeFaultReporting: () => events.push(['monitoring']) },
    './mobile/keyboardViewport': { initializeKeyboardViewport: () => { events.push(['keyboard']); return () => {}; } },
  };
  const source = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source.replaceAll('import.meta', '__meta'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  context.exports = {};
  context.__meta = { env: { MODE: mode } };
  context.require = specifier => {
    const dependency = modules[specifier] ?? (specifier.endsWith('.css') ? {} : null);
    assert(dependency, `Unexpected dependency ${specifier}`);
    return dependency;
  };
  vm.runInContext(compiled, context);
  return { screen: rendered.props.children[0], events, href: location.href };
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

test('the public homepage always uses real member auth and tester access requires its explicit route', async () => {
  for (const mode of ['production', 'demo']) {
    for (const suffix of ['', '?test=0', '?test=true']) {
      const member = await entry('https://app.example/' + suffix, mode);
      assert.equal(member.screen.type, 'App');
      assert.equal(member.screen.props.tester, undefined);
    }
    const tester = await entry('https://app.example/?test=1', mode);
    assert.equal(tester.screen.type, 'TesterGate');
  }
});

test('family invites retain their route and take precedence over a test marker', async () => {
  const family = await entry('https://app.example/?family=1#invite=family-only', 'demo');
  assert.equal(family.screen.type, 'Suspense');
  assert.equal(family.screen.props.children.type, 'GuardianPortal');
  assert.equal(family.screen.props.children.props.inviteToken, 'family-only');
  assert.equal(family.href, 'https://app.example/?family=1');
  assert.equal((await entry('https://app.example/?family=1&test=1')).screen.type, 'Suspense');
});

test('signup callbacks require real login and strip capabilities before telemetry or UI initialization', async () => {
  const signup = await entry('https://app.example/?test=1&family=1&auth=signup#type=signup&access_token=secret&refresh_token=secret');
  assert.equal(signup.screen.type, 'App');
  assert.equal(signup.screen.props.signupReturn, 'returned');
  assert.equal(signup.screen.props.tester, undefined);
  assert.deepEqual(signup.events[0], ['scrub', '/']);
  assert.equal(signup.href, 'https://app.example/');
  const failed = await entry('https://app.example/?auth=signup#error=access_denied&error_description=secret');
  assert.equal(failed.screen.props.signupReturn, 'invalid');
  assert.equal(failed.href, 'https://app.example/');
});

test('password recovery remains isolated even with signup and private route markers', async () => {
  const result = await entry('https://app.example/?test=1&auth=signup#type=recovery&access_token=a&refresh_token=b');
  assert.equal(result.screen.type, 'App');
  assert.equal(result.screen.props.recoveryLink.kind, 'tokens');
  assert.equal(result.screen.props.signupReturn, undefined);
});
