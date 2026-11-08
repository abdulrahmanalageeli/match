import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/testing/TesterGate.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : typeof node === 'string' ? node : node?.props ? text(node.props.children) : '';
function mount(online = true) {
 const hooks = [], effects = [], events = new Map(), requests = []; let cursor = 0;
 const storage = new Map([['saved-session', JSON.stringify({ actor: 'abdulrahman', session: 'saved-token' })]]), network = { onLine: online };
 const react = {
  lazy: () => 'Onboarding', Suspense: 'Suspense', useRef: value => hooks[cursor++] ??= { current: value },
  useState(value) { const at = cursor++; if (!(at in hooks)) hooks[at] = typeof value === 'function' ? value() : value; return [hooks[at], next => { hooks[at] = typeof next === 'function' ? next(hooks[at]) : next; }]; },
  useEffect(fn, deps) { const at = cursor++, old = hooks[at]; if (!old || deps.some((value, i) => value !== old.deps[i])) { old?.cleanup?.(); const slot = hooks[at] = { deps }; effects.push(() => { slot.cleanup = fn(); }); } },
 };
 const modules = {
  react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  '../App': { default: 'AuthenticatedApp' }, '../Brand': { Brand: 'Brand' }, '../Welcome': { Welcome: 'Welcome' },
  './pair': { testStorage: 'saved-session', testProfile: (_actor, profile) => profile, testRequest: (action, token) => new Promise((resolve, reject) => requests.push({ action, token, resolve, reject })) },
 };
 const exports = {};
 vm.runInNewContext(code, { exports, require: name => modules[name] ?? {}, navigator: network,
  sessionStorage: { getItem: key => storage.get(key), removeItem: key => storage.delete(key), setItem: (key, value) => storage.set(key, value) },
  window: { addEventListener: (event, listener) => events.set(event, listener), removeEventListener: event => events.delete(event) },
 });
 const render = () => { cursor = 0; const tree = exports.TesterGate(); effects.splice(0).forEach(effect => effect()); return tree; };
 return { render, requests, storage, events, online() { network.onLine = true; events.get('online')?.(); },
  retry() { nodes(render()).find(node => node.type === 'button' && text(node).includes('إعادة الاتصال')).props.onClick(); render(); },
  close() { hooks.forEach(hook => hook?.cleanup?.()); },
 };
}

test('a transient restoration timeout keeps the credential and requires successful verification before entering', async () => {
 const f = mount(); f.render(); assert.equal(f.requests[0].action, 'state');
 f.requests[0].reject(new Error('timeout')); await tick();
 assert(f.storage.has('saved-session')); assert(text(f.render()).includes('جلسة دخولك محفوظة')); assert.notEqual(f.render().type, 'AuthenticatedApp');
 f.retry(); assert.equal(f.requests.length, 2); assert.equal(f.requests[1].token, 'saved-token');
 f.requests[1].resolve({ actor: 'abdulrahman', profileRevision: '1', profiles: { abdulrahman: { displayName: 'Member' } } }); await tick();
 assert.equal(f.render().type, 'AuthenticatedApp'); assert.equal(f.events.has('online'), false); f.close();
});

test('expired or revoked restoration clears the saved credential and returns to sign in', async () => {
 for (const status of [401, 403]) {
  const f = mount(); f.render(); f.requests[0].reject(Object.assign(new Error('expired'), { status })); await tick();
  assert.equal(f.storage.has('saved-session'), false); assert(text(f.render()).includes('انتهت جلسة الدخول'));
  assert.notEqual(f.render().type, 'AuthenticatedApp'); assert.equal(f.events.has('online'), false); f.close();
 }
});

test('offline restoration waits for connectivity and does not duplicate a pending verification', async () => {
 const f = mount(false); f.render(); assert.equal(f.requests.length, 0); assert(f.storage.has('saved-session'));
 f.online(); f.online(); assert.equal(f.requests.length, 1);
 f.requests[0].reject(new Error('network')); await tick(); assert(f.storage.has('saved-session')); f.close(); assert.equal(f.events.size, 0);
});
