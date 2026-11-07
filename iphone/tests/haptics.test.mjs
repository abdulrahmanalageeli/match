import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = ts.transpileModule(await readFile(new URL('../src/feedback/haptics.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
async function fixture() {
  const calls = [], state = { native: true, platform: 'ios', available: true, enabled: true, hidden: false, time: 1000, fail: false };
  const context = vm.createContext({ document: { get hidden() { return state.hidden; } }, performance: { now: () => state.time } });
  const capacitor = new vm.SyntheticModule(['Capacitor', 'registerPlugin'], function () {
    this.setExport('Capacitor', { isNativePlatform: () => state.native, getPlatform: () => state.platform, isPluginAvailable: () => state.available });
    this.setExport('registerPlugin', () => ({ notify: async options => { calls.push(options.kind); if (state.fail) throw Error('not supported'); } }));
  }, { context });
  const preferences = new vm.SyntheticModule(['getDevicePreferences'], function () { this.setExport('getDevicePreferences', () => ({ haptics: state.enabled })); }, { context });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(specifier => specifier === '@capacitor/core' ? capacitor : preferences); await module.evaluate();
  return { state, calls, ...module.namespace };
}

test('haptics remain silent on web, unsupported builds, hidden screens and opt-out', async () => {
  const f = await fixture();
  for (const [key, value] of [['native', false], ['platform', 'android'], ['available', false], ['enabled', false], ['hidden', true]]) {
    const old = f.state[key]; f.state[key] = value; f.feedback('success'); f.state[key] = old;
  }
  assert.deepEqual(f.calls, []);
  f.feedback('selection'); assert.deepEqual(f.calls, ['selection']);
});
test('completed decisions produce one bounded acknowledgment and never queue later feedback', async () => {
  const f = await fixture(); f.feedback('success'); f.feedback('success'); f.feedback('selection');
  assert.deepEqual(f.calls, ['success']);
  f.state.time += 451; f.feedback('selection'); assert.deepEqual(f.calls, ['success', 'selection']);
  f.state.fail = true; f.state.time += 451; assert.doesNotThrow(() => f.feedback('success'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.calls, ['success', 'selection', 'success']);
});
