import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
function loadScreen(file, children = {}) {
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
  const {outputText} = ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  }});
  const exports = {};
  // Render billing components with React. Platform, artwork and signup modules are outside this test.
  const decoration = new Proxy({}, {get: () => () => null});
  runInNewContext(outputText,{exports, require: id => id.startsWith('react') ? require(id) : children[id] ?? decoration});
  return exports;
}
const {Membership} = loadScreen('Screens.tsx', {'./TestingTrial': loadScreen('TestingTrial.tsx')});

test('trial, expired and paid screens preserve Apple actions and disclose the fetched period', () => {
  const render = props => renderToStaticMarkup(createElement(Membership, {
    canBuy: true, canStart: true, price: 'SAR 55', period: '٣ أشهر', demo: false, ...props
  }));
  for (const status of ['trial', 'expired', 'paid']) {
    const html = render({status, active: status !== 'expired'});
    assert.match(html, /استعادة المشتريات/);
    assert.match(html, /إدارة الاشتراك في Apple/);
    assert.match(html, /تعارفان نشطان/);
    if (status === 'paid') assert.doesNotMatch(html, /اشترك مقابل/);
    else assert.match(html, /اشترك مقابل SAR 55 لكل ٣ أشهر/);
  }
  const free = render({status: 'free', trialEligible: true, startTrial() {}, introduction: 'مجانًا لمدة أسبوع'});
  assert.match(free, /ابدأ تجربتي المجانية/);
  assert.match(free, /مجانًا لمدة أسبوع/);
  assert.match(free, /متابعة العرض عبر Apple/);
  assert.match(render({status:'expired',period:undefined}), /<button class="f-primary" disabled=""/);
});
