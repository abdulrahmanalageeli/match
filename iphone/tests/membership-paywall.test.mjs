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
const Frame = ({children}) => createElement('main', null, children);
const {Membership} = loadScreen('membership/Membership.tsx', {
  '../Screens': {Frame}, '../TestingTrial': loadScreen('TestingTrial.tsx'),
  '../membershipPricing': {membershipPriceLabel:()=>'',seriousnessPriceLabel:()=>''}
});

test('grant copy separates complimentary access from Apple billing and offers disclose both phases',()=>{
 const props={active:true,currentTier:'premium',status:'granted',price:'SAR 55',period:'شهر',expiry:'2030-01-01T00:00:00Z',canBuy:true,canStart:true};
 const grant=renderToStaticMarkup(createElement(Membership,props));
 assert.match(grant,/منحة من وُدَين دون رسوم/);assert.doesNotMatch(grant,/راجع سعر التجديد|إدارة الاشتراك في Apple/);
 const overlapping=renderToStaticMarkup(createElement(Membership,{...props,status:'paid',currentTier:'seriousness',giftUntil:props.expiry}));
 assert.match(overlapping,/يبقى اشتراكك في Apple منفصلًا عنها/);assert.match(overlapping,/إدارة الاشتراك في Apple/);
 const promo=renderToStaticMarkup(createElement(Membership,{...props,active:false,status:'expired',promotion:{id:'return',terms:'٢٩ ر.س لمدة شهر'}}));
 assert.match(promo,/٢٩ ر.س لمدة شهر/);assert.match(promo,/بعد العرض، يتجدد الاشتراك بسعر SAR 55/);assert.match(promo,/الاشتراك بعرض العودة/);
});

test('trial and expired members can restore or manage Apple and see the storefront period', () => {
  const render = props => renderToStaticMarkup(createElement(Membership, {
    canBuy:true,canStart:true,price:'SAR 55',period:'٣ أشهر',demo:false,...props
  }));
  for(const status of ['trial','expired','paid']){
    const html=render({status,active:status!=='expired'});
    assert.match(html,/استعادة المشتريات/);
    assert.match(html,/إدارة الاشتراك في Apple/);
    if(status!=='paid')assert.match(html,/SAR 55 لكل ٣ أشهر/);
  }
  const free=render({status:'free',trialEligible:true,introduction:'مجانًا لمدة أسبوع',pilotEligible:true,startPilot(){}});
  assert.match(free,/ابدأ تجربتي المجانية/);
  assert.match(free,/مجانًا لمدة أسبوع/);
  assert.match(render({status:'expired',period:undefined}),/class="f-primary wd-purchase" disabled/);
});
