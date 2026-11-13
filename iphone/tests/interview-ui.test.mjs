import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import topics from '../src/interview/catalog.json' with { type: 'json' };

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const code = compile(await readFile(new URL('../src/interview/InterviewPanel.tsx', import.meta.url), 'utf8'));
const tick = () => new Promise(resolve => setImmediate(resolve));
const noop = () => {};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const textOf = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(textOf).join('') : textOf(node?.props?.children ?? '');
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const find = (tree, label) => nodes(tree).find(node => node.props?.onClick && textOf(node).includes(label));
const clone = value => JSON.parse(JSON.stringify(value));
const proposal = { id: 'p1', kind: 'preference', fieldId: 'children_plan', side: 'self', values: ['A'], summary: 'تريد أطفالًا', evidence: [{ turnId: 't1', quote: 'أبغى أطفال' }], needsClarification: false };
const baseDocument = () => ({ version: 'interview-v1', consentVersion: 'wudayn-interview-v1', model: 'gpt-6-luna', promptVersion: 'wudayn-interview-1', status: 'active', turns: [], currentQuestion: { topic: 'intent', text: topics[0].question, suggestions: [] }, proposals: [], readiness: [], clarifications: [], confirmed: [], lastRequestId: null, lastMode: 'luna', pendingAnalysis: false, draftAnswer: '', reviewSharing: false, confirmedAt: null });

function mount(initial, intercept = () => null) {
  const hooks = [], effects = [], timers = new Map(), calls = [], applied = []; let cursor = 0, changed = false, timerId = 0, snapshot = clone(initial), closed = 0, uuid = 0;
  let props = { open: true, auth: { token: 'member-1' }, onApply: value => applied.push(clone(value)), onClose: () => { closed++; props = { ...props, open: false }; } };
  const memo = (fn, deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((value,i) => value !== old.deps[i])) hooks[at] = { value: fn(), deps }; return hooks[at].value; };
  const react = {
    useCallback: (fn,deps) => memo(() => fn,deps),
    useRef: value => { const at = cursor++; return hooks[at] ??= { current: value }; },
    useState: value => { const at = cursor++; if (!(at in hooks)) hooks[at] = typeof value === 'function' ? value() : value; return [hooks[at], next => { const result = typeof next === 'function' ? next(hooks[at]) : next; if (result !== hooks[at]) { hooks[at] = result; changed = true; } }]; },
    useEffect: (fn,deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((value,i) => value !== old.deps[i])) { old?.cleanup?.(); const item = hooks[at] = { deps }; effects.push(() => { item.cleanup = fn(); }); } },
  };
  const options = [{value:'A',label:'أرغب في الإنجاب'},{value:'B',label:'لا أرغب في الإنجاب'}];
  async function requestInterview(auth, payload) {
    calls.push(clone(payload));
    const supplied = intercept(payload, snapshot); if (supplied) return await supplied;
    if (payload.action === 'load') return clone(snapshot);
    if (payload.action === 'start') snapshot = { document: baseDocument(), revision: 1 };
    if (payload.action === 'draft') snapshot = { document: { ...snapshot.document, draftAnswer: payload.answer }, revision: snapshot.revision + 1 };
    if (payload.action === 'confirm') snapshot = { document: { ...snapshot.document, status: 'confirmed', confirmed: payload.choices.map(choice => ({ ...proposal, ...choice })), reviewSharing: payload.shareReview }, revision: snapshot.revision + 1 };
    if (payload.action === 'delete') snapshot = { document: null, revision: 0 };
    if (payload.action === 'resume') snapshot = { document: { ...snapshot.document, status:'active', currentQuestion: { topic: 'family', text: topics[3].question, suggestions: [] }, confirmed:[], reviewSharing:false }, revision:snapshot.revision+1 };
    return clone(snapshot);
  }
  const exports = {};
  const icons = new Proxy({}, { get: (_target,key) => Object.defineProperty(() => null,'name',{value:key}) });
  const require = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type,props,key) => ({type,props,key}), jsxs: (type,props,key) => ({type,props,key}) };
    if (name === 'react-dom') return { createPortal: tree => tree };
    if (name === '../BrandIcons') return icons;
    if (name === '../motion/Reanimated') return { MotionReveal: 'motion-section', MotionPressButton: 'motion-button' };
    if (name === '../feedback/haptics') return { feedback: noop };
    if (name === './api') return { requestInterview, InterviewError: class extends Error {} };
    if (name === './model') return { proposalOptions: () => options, proposalSide: () => 'ما يصفني', proposalTitle: () => 'الأطفال' };
    if (name === './catalog.json') return { default: topics };
    if (name.endsWith('.css')) return {};
    throw Error(`Unexpected import ${name}`);
  };
  vm.runInNewContext(code,{exports,require,document:{body:{},hidden:false,addEventListener:noop,removeEventListener:noop},crypto:{randomUUID:()=>`request-${++uuid}`},window:{setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),addEventListener:noop,removeEventListener:noop}});
  return {
    calls, applied,
    get closed() { return closed; },
    render(next) { if (next) props = {...props,...next}; let tree, passes=0; do { changed=false;cursor=0;tree=exports.InterviewPanel(props);for(const effect of effects.splice(0))effect();if(++passes>25)throw Error('Unstable component'); } while(changed);return tree; },
    timers() { const pending=[...timers.values()];timers.clear();for(const timer of pending)timer(); },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

test('the actual welcome component requires explicit consent and sends no interview text merely on opening', async () => {
  const ui=mount({document:null,revision:0});ui.render();await tick();let tree=ui.render();
  assert.deepEqual(ui.calls.map(call=>call.action),['load']);
  assert.equal(find(tree,'خلّنا نبدأ').props.disabled,true);
  nodes(tree).find(node=>node.type==='input'&&node.props.type==='checkbox').props.onChange({target:{checked:true}});
  tree=ui.render();assert.equal(find(tree,'خلّنا نبدأ').props.disabled,false);
  find(tree,'خلّنا نبدأ').props.onClick();await tick();ui.render();
  assert.equal(ui.calls[1].consentVersion,'wudayn-interview-v1');assert.equal(ui.applied.length,0);ui.unmount();
});

test('draft save is serialized with submitting and newer typing remains visible when an older save completes', async () => {
  const waiting=deferred();const initial={document:baseDocument(),revision:1};
  const ui=mount(initial,payload=>payload.action==='draft'?waiting.promise:null);ui.render();await tick();let tree=ui.render();
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'أول إجابة'}});ui.render();ui.timers();tree=ui.render();
  assert.equal(find(tree,'متابعة').props.disabled,false,'autosave must not swallow the next action');
  const textarea=nodes(tree).find(node=>node.type==='textarea');assert.equal(textarea.props.disabled,false);
  textarea.props.onChange({target:{value:'أول إجابة مع تفاصيل إضافية'}});ui.render();
  waiting.resolve({document:{...initial.document,draftAnswer:'أول إجابة'},revision:2});await tick();tree=ui.render();
  assert.equal(nodes(tree).find(node=>node.type==='textarea').props.value,'أول إجابة مع تفاصيل إضافية');assert.equal(ui.calls.filter(call=>call.action==='answer').length,0);ui.unmount();
});

test('withdrawing staff sharing does not reapply saved assessment answers', async () => {
  const document={...baseDocument(),status:'confirmed',currentQuestion:null,proposals:[proposal],confirmed:[proposal],reviewSharing:true};
  const ui=mount({document,revision:3});ui.render();await tick();let tree=ui.render();
  const sharing=nodes(tree).find(node=>node.type==='label'&&node.props.className==='wi-sharing');
  nodes(sharing).find(node=>node.type==='input').props.onChange({target:{checked:false}});tree=ui.render();
  find(tree,'سحب مشاركة الملخص فقط').props.onClick();await tick();tree=ui.render();
  assert.equal(ui.calls.at(-1).action,'confirm');assert.equal(ui.calls.at(-1).shareReview,false);assert.equal(ui.applied.length,0);
  assert.match(textOf(tree),/دون تغيير إجابات ملفك/);ui.unmount();
});

test('only an explicit confirmation applies selected values, while reopening and continuing does not', async () => {
  const document={...baseDocument(),status:'review',currentQuestion:null,proposals:[proposal]};
  const ui=mount({document,revision:2});ui.render();await tick();let tree=ui.render();
  assert.equal(ui.applied.length,0);find(tree,'اختيار الواضح منها').props.onClick();tree=ui.render();find(tree,'تأكيد').props.onClick();await tick();tree=ui.render();
  assert.equal(ui.applied.length,1);assert.equal(ui.applied[0][0].values[0],'A');assert.match(textOf(tree),/راجع الملف واحفظه/);
  find(tree,'مراجعة الجلسة وخيارات المشاركة').props.onClick();tree=ui.render();find(tree,'أكمل الحوار').props.onClick();await tick();tree=ui.render();
  assert.equal(ui.calls.at(-1).action,'resume');assert.equal(ui.applied.length,1);assert.ok(nodes(tree).some(node=>node.type==='textarea'));ui.unmount();
});

test('closing during model processing is allowed and never commits answers to the profile', async () => {
  const waiting=deferred();const initial={document:baseDocument(),revision:1};
  const ui=mount(initial,payload=>payload.action==='answer'?waiting.promise:null);ui.render();await tick();let tree=ui.render();
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'أبغى نرتب خطوتنا مع الأهل'}});tree=ui.render();find(tree,'متابعة').props.onClick();tree=ui.render();
  const close=nodes(tree).find(node=>node.props?.['aria-label']==='حفظ وإغلاق الجلسة');assert.equal(close.props.disabled,false);close.props.onClick();assert.equal(ui.closed,1);
  waiting.resolve({document:{...initial.document,draftAnswer:''},revision:2});await tick();ui.render();assert.equal(ui.applied.length,0);ui.unmount();
});

test('a late confirmation response after leaving the account cannot update the profile', async () => {
  const waiting=deferred();const document={...baseDocument(),status:'review',currentQuestion:null,proposals:[proposal]};
  const ui=mount({document,revision:2},payload=>payload.action==='confirm'?waiting.promise:null);ui.render();await tick();let tree=ui.render();
  find(tree,'اختيار الواضح منها').props.onClick();tree=ui.render();find(tree,'تأكيد').props.onClick();ui.render();ui.unmount();
  waiting.resolve({document:{...document,status:'confirmed',confirmed:[proposal]},revision:3});await tick();assert.equal(ui.applied.length,0);
});

test('an uncertain send retries the same request ID without dropping the written answer', async () => {
  let attempts=0;const initial={document:baseDocument(),revision:1};
  const ui=mount(initial,payload=>payload.action==='answer'&&++attempts===1?Promise.reject(new Error('انقطع الاتصال')):null);ui.render();await tick();let tree=ui.render();
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'أتمنى نتفق على توقيت مناسب'}});tree=ui.render();find(tree,'متابعة').props.onClick();await tick();tree=ui.render();
  assert.equal(nodes(tree).find(node=>node.type==='textarea').props.value,'أتمنى نتفق على توقيت مناسب');find(tree,'متابعة').props.onClick();await tick();ui.render();
  const sends=ui.calls.filter(call=>call.action==='answer');assert.equal(sends.length,2);assert.equal(sends[0].requestId,sends[1].requestId);ui.unmount();
});

test('an unfinished analysis cannot be applied or shared; the direct questionnaire remains available', async () => {
  const document={...baseDocument(),status:'review',currentQuestion:null,pendingAnalysis:true,proposals:[proposal]};
  const ui=mount({document,revision:2});ui.render();await tick();let tree=ui.render();find(tree,'اختيار الواضح منها').props.onClick();tree=ui.render();
  assert.equal(find(tree,'تأكيد').props.disabled,true);
  const sharing=nodes(tree).find(node=>node.type==='label'&&node.props.className==='wi-sharing');assert.equal(nodes(sharing).find(node=>node.type==='input').props.disabled,true);
  assert.ok(find(tree,'إعادة التحليل'));assert.ok(find(tree,'العودة إلى الأسئلة المباشرة'));assert.equal(ui.applied.length,0);ui.unmount();
});

test('Continue pressed during autosave waits for its revision and sends the newest draft exactly once', async () => {
  const waiting=deferred();const initial={document:baseDocument(),revision:1};
  const ui=mount(initial,payload=>payload.action==='draft'?waiting.promise:null);ui.render();await tick();let tree=ui.render();
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'إجابة أولى'}});ui.render();ui.timers();tree=ui.render();
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'إجابة أحدث جاهزة للإرسال'}});tree=ui.render();
  const send=find(tree,'متابعة');assert.equal(send.props.disabled,false);send.props.onClick();send.props.onClick();ui.render();
  assert.equal(ui.calls.filter(call=>call.action==='answer').length,0);
  waiting.resolve({document:{...initial.document,draftAnswer:'إجابة أولى'},revision:9});await tick();ui.render();
  const sends=ui.calls.filter(call=>call.action==='answer');assert.equal(sends.length,1);assert.equal(sends[0].revision,9);assert.equal(sends[0].answer,'إجابة أحدث جاهزة للإرسال');ui.unmount();
});

test('closing during autosave waits and flushes newer typing before leaving', async () => {
  const waiting=deferred();const initial={document:baseDocument(),revision:1};let saves=0;
  const ui=mount(initial,payload=>payload.action==='draft'&&++saves===1?waiting.promise:null);ui.render();await tick();let tree=ui.render();
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'مسودة أولى'}});ui.render();ui.timers();tree=ui.render();
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'مسودة أحدث'}});tree=ui.render();
  nodes(tree).find(node=>node.props?.['aria-label']==='حفظ وإغلاق الجلسة').props.onClick();assert.equal(ui.closed,0);
  waiting.resolve({document:{...initial.document,draftAnswer:'مسودة أولى'},revision:4});await tick();ui.render();
  const drafts=ui.calls.filter(call=>call.action==='draft');assert.equal(drafts.length,2);assert.equal(drafts[1].answer,'مسودة أحدث');assert.equal(drafts[1].revision,4);assert.equal(ui.closed,1);ui.unmount();
});
