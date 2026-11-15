import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const settingsCode=ts.transpileModule(await readFile(new URL('../settings/Settings.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function settingsHarness(initial){
  const hooks=[],effects=[];let cursor=0,props=initial;
  const effect=(fn,deps)=>{const at=cursor++,old=hooks[at];if(!old||deps.some((x,i)=>x!==old.deps[i])){old?.cleanup?.();const item=hooks[at]={deps};effects.push(()=>{item.cleanup=fn()});}};
  const react={useState(value){const at=cursor++;if(!(at in hooks))hooks[at]=typeof value==='function'?value():value;return[hooks[at],next=>{hooks[at]=typeof next==='function'?next(hooks[at]):next}];},useRef(value){return hooks[cursor++]??={current:value}},useEffect:effect,useLayoutEffect:effect};
  const exports={},placeholders=new Proxy({},{get:(_target,key)=>key});
  vm.runInNewContext(settingsCode,{exports,require(name){
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
    if(name==='./preferences')return{useDevicePreferences:()=>({value:{},setPreference(){}}),useSystemReducedMotion:()=>false};
    if(name==='../feedback/haptics')return{hasHaptics:()=>false};
    return placeholders;
  }});
  return{render(next){if(next)props=next;cursor=0;const tree=exports.Settings(props);for(const run of effects.splice(0))run();return tree;},close(){for(const hook of hooks)hook?.cleanup?.()}};
}
const treeNodes=node=>Array.isArray(node)?node.flatMap(treeNodes):node&&typeof node==='object'?[node,...treeNodes(node.props?.children)]:[];

let loader, VerifiedBadge, VerificationCenter, MemberProfile, Settings, DirectoryRow, PersonCard;
before(async () => {
  loader = await createServer({
    configFile: false, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false },
    plugins: [{ name: 'verification-static-motion', enforce: 'pre', load(id) {
      if (id.replaceAll('\\', '/').endsWith('/src/ScenePaths.tsx')) return 'export function ScenePaths(){return null}';
      if (id.replaceAll('\\', '/').endsWith('/motion/Reanimated.tsx')) return `import {createElement,forwardRef} from 'react';
        export function MotionReveal({as='div',delay,duration,active,axis,distance,fromOpacity,fromScale,...props}){return createElement(as,props)}
        export const MotionPressButton=forwardRef((props,ref)=>createElement('button',{...props,ref}));`;
    } }, { name: 'verification-render-exports', transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/community/Community.tsx')) return code + '\nexport { DirectoryRow, PersonCard };';
      // Render tests must not initialize a live authentication client.
      if (id.replaceAll('\\', '/').endsWith('/src/cloud.ts')) return code.replace(/export const cloud =\s*deployment\.ready/, 'export const cloud = false');
    } }],
  });
  ({ VerifiedBadge } = await loader.ssrLoadModule('/src/verification/VerifiedBadge.tsx'));
  ({ VerificationCenter } = await loader.ssrLoadModule('/src/verification/VerificationCenter.tsx'));
  ({ MemberProfile } = await loader.ssrLoadModule('/src/profile/MemberProfile.tsx'));
  ({ Settings } = await loader.ssrLoadModule('/src/settings/Settings.tsx'));
  ({ DirectoryRow, PersonCard } = await loader.ssrLoadModule('/src/community/Community.tsx'));
});
after(() => loader?.close());
const noop = () => {};
const claim = { id: 'synthetic-claim', kind: 'marital_status', label: 'الحالة الاجتماعية', reviewedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), isTest: false };
const person = { id: 'synthetic-member', alias: 'عضو تجريبي', age: 31, city: 'الرياض', occupation: 'مهندس', bio: 'بيانات اصطناعية للاختبار', interests: [], reasons: [], manualVerifications: [claim] };
const profile = { displayName: 'عضو تجريبي', age: 31, gender: 'man', city: 'الرياض', profession: 'مهندس', bio: '', marriageBasics: { maritalStatus: 'never_married' } };
const source = { verification: async () => ({ requests: [], claims: [], isTest: true }), submitVerification: async () => ({ requests: [], claims: [], isTest: true }), verificationTestMode: true };
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
function noNestedButtons(html) {
  let depth = 0;
  for (const tag of html.match(/<\/?button\b[^>]*>/g) ?? []) {
    depth += tag.startsWith('</') ? -1 : 1;
    assert.ok(depth <= 1 && depth >= 0, 'button must not contain another button');
  }
  assert.equal(depth, 0);
}

test('badge describes its manual scope and preserves visible test distinction', () => {
  const html = render(VerifiedBadge, { claims: [claim] });
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /الحالة الاجتماعية/);
  assert.match(html, /عرض نطاق التوثيق وصلاحيته/);
  assert.doesNotMatch(html, /موثق رسميًا|حكومي/);
  assert.match(render(VerifiedBadge, { claims: [{ ...claim, isTest: true }], compact: true }), /توثيق تجريبي/);
  assert.equal(render(VerifiedBadge, { claims: [{ ...claim, expiresAt: '2000-01-01T00:00:00Z' }] }), '');
});

test('actual discovery row and portrait card contain no nested buttons with a valid claim', () => {
  for (const component of [DirectoryRow, PersonCard]) {
    const html = render(component, { person, source: {}, open: noop, request: noop, interest: noop, dismiss: noop, report: noop, busy: false });
    assert.match(html, /mv-badge-static/);
    assert.match(html, /الحالة الاجتماعية/);
    noNestedButtons(html);
  }
});

test('full profile provides an interactive scoped badge outside all other controls', () => {
  const html = render(MemberProfile, { person, source: null, back: noop, backText: 'رجوع' });
  assert.match(html, /class="mv-badge/);
  assert.match(html, /aria-haspopup="dialog"/);
  noNestedButtons(html);
});

test('document collection is unavailable for demo, testers and members while history stays accessible', () => {
  const unavailable = render(VerificationCenter, { source: {}, profile, onBack: noop });
  assert.match(unavailable, /لا يمكن إرسال مستندات من العرض التجريبي العام/);
  assert.doesNotMatch(unavailable, /type="file"/);
  const tester = render(VerificationCenter, { source, profile, onBack: noop });
  assert.match(tester, /إرسال المستندات متوقف مؤقتًا/);
  assert.match(tester, /طلباتك/);
  assert.doesNotMatch(tester, /type="file"|type="checkbox"|استكمال الطلب/);
  const member = render(VerificationCenter, { source: { ...source, verificationTestMode: false }, profile, onBack: noop });
  assert.match(member, /إرسال المستندات متوقف مؤقتًا/);
  assert.doesNotMatch(member, /type="file"/);
  noNestedButtons(tester);
});

test('Settings waits for previous verification history before exposing its archive', () => {
  const props = { state: null, demo: true, demoMember: profile, paused: false, busy: false, onEdit: noop, onMembership: noop, onToggle: noop, onDelete: noop, onExit: noop, onPrivacy: noop };
  const html = render(Settings, { ...props, source });
  assert.doesNotMatch(html, /st-verification-entry/,'An empty or still-loading archive must not advertise document submission');
  noNestedButtons(html);
  assert.doesNotMatch(render(Settings, { ...props, source: {} }), /st-verification-entry/);
});

test('Settings shows real verification history and rejects a late response from the previous account',async()=>{
  const props={state:null,demo:true,demoMember:profile,paused:false,busy:false};
  let release;
  const oldSource={verification:()=>new Promise(resolve=>{release=resolve})};
  const currentSource={verification:async()=>({claims:[],requests:[]})};
  const h=settingsHarness({...props,source:oldSource});
  const hasArchive=tree=>treeNodes(tree).some(node=>node.props?.className==='st-verification-entry');
  assert.equal(hasArchive(h.render()),false);
  h.render({...props,source:currentSource});
  release({claims:[claim],requests:[{id:'old-account-request'}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(hasArchive(h.render()),false,'Previous account history must not reappear');
  h.render({...props,source:{verification:async()=>({claims:[],requests:[{id:'current-request'}]})}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(hasArchive(h.render()),true,'A genuine previous request makes the archive reachable');
  h.close();
});
