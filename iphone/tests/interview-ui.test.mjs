import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import topics from '../src/interview/catalog.json' with { type: 'json' };
import personalityCatalog from '../src/compatibility/personality-catalog.json' with { type: 'json' };
import profileCatalog from '../src/interview/profile-catalog.json' with { type: 'json' };

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const code = compile(await readFile(new URL('../src/interview/InterviewPanel.tsx', import.meta.url), 'utf8'));
const profileHelpers = {};
vm.runInNewContext(compile(await readFile(new URL('../src/interview/profileCapture.ts', import.meta.url), 'utf8')), {exports:profileHelpers,require:name=>name==='./profile-catalog.json'?{default:profileCatalog}: {validMarriageBasicsDraft:()=>true,validPartnerCriteriaDraft:()=>true}});
const tick = () => new Promise(resolve => setImmediate(resolve));
const noop = () => {};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const textOf = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(textOf).join('') : textOf(node?.props?.children ?? '');
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const find = (tree, label) => nodes(tree).find(node => node.props?.onClick && textOf(node).includes(label));
const sendAction = tree => ({ props: { disabled: nodes(tree).find(node => node.props?.['aria-label'] === 'إرسال الرسالة').props.disabled, onClick: () => nodes(tree).find(node => node.type === 'form' && node.props.className === 'wi-composer').props.onSubmit({preventDefault:noop}) } });
const clone = value => JSON.parse(JSON.stringify(value));
const proposal = { id: 'p1', kind: 'preference', fieldId: 'children_plan', side: 'self', values: ['A'], summary: 'تريد أطفالًا', evidence: [{ turnId: 't1', quote: 'أبغى أطفال' }], needsClarification: false };
const baseDocument = () => ({ version: 'interview-v1', consentVersion: 'wudayn-interview-v1', model: 'gpt-6-luna', promptVersion: 'wudayn-interview-1', status: 'active', turns: [], currentQuestion: { topic: 'intent', text: topics[0].question, suggestions: [] }, proposals: [], readiness: [], clarifications: [], confirmed: [], lastRequestId: null, lastMode: 'luna', pendingAnalysis: false, draftAnswer: '', reviewSharing: false, confirmedAt: null });

function mount(initial, intercept = () => null) {
  const hooks = [], effects = [], timers = new Map(), calls = [], applied = [], profileApplied = []; let cursor = 0, changed = false, timerId = 0, snapshot = clone(initial), closed = 0, uuid = 0;
  let props = { open: true, auth: { token: 'member-1' }, onApply: value => applied.push(clone(value)), onProfileApply:value=>profileApplied.push(clone(value)), onClose: () => { closed++; props = { ...props, open: false }; } };
  const memo = (fn, deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((value,i) => value !== old.deps[i])) hooks[at] = { value: fn(), deps }; return hooks[at].value; };
  const react = {
    useCallback: (fn,deps) => memo(() => fn,deps),
    useRef: value => { const at = cursor++; return hooks[at] ??= { current: value }; },
    useState: value => { const at = cursor++; if (!(at in hooks)) hooks[at] = typeof value === 'function' ? value() : value; return [hooks[at], next => { const result = typeof next === 'function' ? next(hooks[at]) : next; if (result !== hooks[at]) { hooks[at] = result; changed = true; } }]; },
    useEffect: (fn,deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((value,i) => value !== old.deps[i])) { old?.cleanup?.(); const item = hooks[at] = { deps }; effects.push(() => { item.cleanup = fn(); }); } },
  };
  react.useLayoutEffect = react.useEffect;
  const options = [{value:'A',label:'أرغب في الإنجاب'},{value:'B',label:'لا أرغب في الإنجاب'}];
  async function requestInterview(auth, payload) {
    calls.push(clone(payload));
    const supplied = intercept(payload, snapshot); if (supplied) return await supplied;
    if (payload.action === 'load') return clone(snapshot);
    if (payload.action === 'start') snapshot = { document: baseDocument(), revision: 1 };
    if (payload.action === 'draft') snapshot = { document: { ...snapshot.document, draftAnswer: payload.answer }, revision: snapshot.revision + 1 };
    if (payload.action === 'confirm') snapshot = { document: { ...snapshot.document, status: 'confirmed', confirmed: payload.choices.map(choice => ({ ...snapshot.document.proposals.find(item=>item.id===choice.id), ...choice })), reviewSharing: payload.shareReview }, revision: snapshot.revision + 1 };
    if (payload.action === 'profileConfirm') snapshot = { document: {...snapshot.document,profileConfirmed:payload.profileChoices.map(choice=>({...snapshot.document.profileProposals.find(item=>item.id===choice.id),...choice,needsClarification:false}))},revision:snapshot.revision+1};
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
    if (name === './model') return {
      proposalOptions: item => item.kind==='personality' ? ['A','B','C','D','E'].map((value,index)=>({value,label:['لا يشبهني إطلاقًا','يشبهني قليلًا','يشبهني أحيانًا','يشبهني غالبًا','يشبهني كثيرًا'][index]})) : options,
      proposalSide: () => 'ما يصفني',
      proposalTitle: item => item.kind==='personality' ? personalityCatalog.find(question=>question.id===item.fieldId)?.title??'' : 'الأطفال',
      proposalStatement: item => item.kind==='personality' ? personalityCatalog.find(question=>question.id===item.fieldId)?.prompt??'' : '',
    };
    if (name === './catalog.json') return { default: topics };
    if (name === './profileCapture') return profileHelpers;
    if (name.endsWith('.css')) return {};
    throw Error(`Unexpected import ${name}`);
  };
  vm.runInNewContext(code,{exports,require,document:{body:{},hidden:false,addEventListener:noop,removeEventListener:noop},crypto:{randomUUID:()=>`request-${++uuid}`},window:{setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),addEventListener:noop,removeEventListener:noop}});
  return {
    calls, applied, profileApplied,
    get closed() { return closed; },
    render(next) { if (next) props = {...props,...next}; let tree, passes=0; do { changed=false;cursor=0;tree=exports.InterviewPanel(props);for(const effect of effects.splice(0))effect();if(++passes>25)throw Error('Unstable component'); } while(changed);return tree; },
    timers() { const pending=[...timers.values()];timers.clear();for(const timer of pending)timer(); },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

test('the actual welcome component requires explicit consent and sends no interview text merely on opening', async () => {
  const ui=mount({document:null,revision:0});ui.render();await tick();let tree=ui.render();
  assert.deepEqual(ui.calls.map(call=>call.action),['load']);
  assert.equal(find(tree,'ابدأ الحوار').props.disabled,true);
  nodes(tree).find(node=>node.type==='input'&&node.props.type==='checkbox').props.onChange({target:{checked:true}});
  tree=ui.render();assert.equal(find(tree,'ابدأ الحوار').props.disabled,false);
  find(tree,'ابدأ الحوار').props.onClick();await tick();ui.render();
  assert.equal(ui.calls[1].consentVersion,'wudayn-interview-v1');assert.equal(ui.applied.length,0);ui.unmount();
});

test('the active experience is an ordered conversation with a composer and no survey skip controls', async () => {
  const document={...baseDocument(),turns:[{id:'t1',topic:'intent',question:'ما الذي تبحث عنه؟',answer:'زواج جاد',skipped:false}],currentQuestion:{topic:'family',text:'متى تحب إشراك الأهل؟',suggestions:[]}};
  const ui=mount({document,revision:2});ui.render();await tick();const tree=ui.render();
  const log=nodes(tree).find(node=>node.props?.role==='log');assert(log);assert.match(textOf(log),/ما الذي تبحث عنه؟.*زواج جاد.*متى تحب إشراك الأهل؟/);
  assert(nodes(tree).some(node=>node.type==='form'&&node.props.className==='wi-composer'));const input=nodes(tree).find(node=>node.type==='textarea');assert.equal(input.props.dir,'rtl');assert.equal(input.props.lang,'ar');assert.equal(input.props.wrap,'soft');assert.equal(find(tree,'تجاوز السؤال'),undefined);assert.equal(find(tree,'العودة إلى الأسئلة المباشرة'),undefined);ui.unmount();
});

test('adaptive progress uses calm milestones without exposing a numeric assessment total', async () => {
  const document={...baseDocument(),turns:[{id:'t1',topic:'communication',question:'كيف تتعامل مع الاختلاف؟',answer:'بهدوء',skipped:false}],currentQuestion:{topic:'family',text:'كيف تتصور دور الأهل؟',suggestions:[]}};
  const ui=mount({document,revision:2,coverage:{answered:17,required:44}});ui.render();await tick();const tree=ui.render();
  const milestones=nodes(tree).find(node=>node.type==='ol'&&node.props.className==='wi-session-milestones');
  assert.ok(milestones);assert.match(textOf(milestones),/أنت.*الشريك.*الحياة معًا/);
  assert.equal(nodes(tree).find(node=>node.props?.role==='progressbar'),undefined);
  assert.match(textOf(tree),/خاص · لا يظهر للأعضاء/);assert.doesNotMatch(textOf(tree),/17|44|١٧|٤٤/);ui.unmount();
});

test('the first turn invites one rich introduction before switching to compact gap questions', async () => {
  const ui=mount({document:baseDocument(),revision:1});ui.render();await tick();let tree=ui.render();
  const form=nodes(tree).find(node=>node.type==='form'&&node.props.className==='wi-composer');
  const input=nodes(tree).find(node=>node.type==='textarea');
  assert.equal(form.props['data-opening'],true);
  assert.equal(input.props.rows,4);
  assert.match(input.props.placeholder,/عرّفنا عن نفسك/);
  assert.match(textOf(tree),/عنّك.*حياتك اليوم.*الشريك الذي تبحث عنه.*استعدادك للزواج/);
  assert.match(textOf(tree),/فقرة واحدة.*نسأل فقط عمّا بقي/);
  find(tree,'كيف أبدأ؟').props.onClick();tree=ui.render();
  assert.match(textOf(tree),/ما يعنيه لك الزواج الجاد والخطوة الرسمية/);
  ui.unmount();

  const later=mount({document:{...baseDocument(),turns:[{id:'t1',topic:'intent',question:'عرّفنا عن نفسك',answer:'أنا جاد في الزواج',skipped:false}],currentQuestion:{topic:'family',text:'كيف تتصور دور الأهل؟',suggestions:[]}},revision:2});
  later.render();await tick();tree=later.render();
  assert.equal(nodes(tree).find(node=>node.type==='form'&&node.props.className==='wi-composer').props['data-opening'],undefined);
  assert.equal(nodes(tree).find(node=>node.type==='textarea').props.rows,1);
  assert.equal(nodes(tree).find(node=>node.type==='textarea').props.placeholder,'قل لنا بطريقتك…');
  assert.doesNotMatch(textOf(tree),/الشريك الذي تبحث عنه.*استعدادك للزواج/);
  later.unmount();
});

test('draft save is serialized with submitting and newer typing remains visible when an older save completes', async () => {
  const waiting=deferred();const initial={document:baseDocument(),revision:1};
  const ui=mount(initial,payload=>payload.action==='draft'?waiting.promise:null);ui.render();await tick();let tree=ui.render();
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'أول إجابة'}});ui.render();ui.timers();tree=ui.render();
  assert.equal(sendAction(tree).props.disabled,false,'autosave must not swallow the next action');
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

test('one explicit confirmation applies the whole summary without per-answer approval checkboxes', async () => {
  const document={...baseDocument(),status:'review',currentQuestion:null,proposals:[proposal]};
  const ui=mount({document,revision:2});ui.render();await tick();let tree=ui.render();assert.equal(ui.applied.length,0);
  const rows=nodes(tree).filter(node=>typeof node.type==='function'&&node.type.name==='ProposalReview');assert.equal(rows.length,1);
  assert.equal(nodes(rows[0].type(rows[0].props)).filter(node=>node.type==='input'&&node.props.type==='checkbox').length,0);
  find(tree,'اعتماد الملخص').props.onClick();await tick();tree=ui.render();assert.equal(ui.applied.length,1);assert.equal(ui.applied[0][0].values[0],'A');assert.match(textOf(tree),/مسودة ملفك/);
  find(tree,'عرض الملخص').props.onClick();ui.render();assert.equal(ui.applied.length,1);ui.unmount();
});

test('partner defaults are clearly labelled and remain editable in the final review', async () => {
  const inferred={...proposal,id:'preference:children_plan:partner',side:'partner',source:'self_default'};
  const ui=mount({document:{...baseDocument(),status:'review',currentQuestion:null,proposals:[inferred]},revision:2});ui.render();await tick();let tree=ui.render();
  const row=nodes(tree).find(node=>typeof node.type==='function'&&node.type.name==='ProposalReview');
  const rendered=row.type(row.props);assert.match(textOf(rendered),/مقترح من إجابتك · قابل للتعديل/);
  assert.equal(nodes(rendered).find(node=>node.type==='details').props['data-defaulted'],true);
  nodes(rendered).find(node=>node.type==='select').props.onChange({target:{value:'B'}});tree=ui.render();
  assert.equal(nodes(tree).find(node=>typeof node.type==='function'&&node.type.name==='ProposalReview').props.values[0],'B');ui.unmount();
});

test('quick replies send the exact choice once without opening a confirmation or replacing a draft', async () => {
  const document={...baseDocument(),currentQuestion:{topic:'family',text:'هل ترغب في الإنجاب؟',suggestions:['نعم، أرغب في الإنجاب','لا أرغب في الإنجاب']}};
  const ui=mount({document,revision:1});ui.render();await tick();let tree=ui.render();
  assert.match(textOf(tree),/اختر الأقرب لك، أو اكتب إجابتك بطريقتك/);
  const quick=find(tree,'نعم، أرغب في الإنجاب');assert.ok(quick);quick.props.onClick();await tick();tree=ui.render();
  assert.equal(ui.calls.filter(call=>call.action==='answer').length,1);
  assert.equal(ui.calls.find(call=>call.action==='answer').answer,'نعم، أرغب في الإنجاب');assert.equal(ui.applied.length,0);
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'أحتاج وقتًا للتفكير'}});tree=ui.render();
  assert.equal(find(tree,'نعم، أرغب في الإنجاب'),undefined,'chips disappear while a draft is being written');
  quick.props.onClick();await tick();tree=ui.render();
  assert.equal(nodes(tree).find(node=>node.type==='textarea').props.value,'أحتاج وقتًا للتفكير');
  assert.equal(ui.calls.filter(call=>call.action==='answer').length,1);ui.unmount();
});

test('quick replies remain disabled while analysis is pending', async () => {
  const document={...baseDocument(),pendingAnalysis:true,currentQuestion:{topic:'family',text:'هل ترغب في الإنجاب؟',suggestions:['نعم، أرغب في الإنجاب']}};
  const ui=mount({document,revision:1});ui.render();await tick();const tree=ui.render();
  assert.equal(find(tree,'نعم، أرغب في الإنجاب').props.disabled,true);ui.unmount();
});

test('uncertain interpretations require correction while clear answers need no repeated approvals', async () => {
  const known={...proposal,id:'personality:directness:self',kind:'personality',fieldId:'directness',values:['D']};
  const uncertain={...known,id:'personality:openness:self',fieldId:'openness',values:['C'],needsClarification:true};
  const ui=mount({document:{...baseDocument(),status:'review',currentQuestion:null,proposals:[known,uncertain]},revision:2});ui.render();await tick();let tree=ui.render();
  const reviews=()=>nodes(tree).filter(node=>typeof node.type==='function'&&node.type.name==='ProposalReview');assert.equal(reviews().length,2);
  assert.match(textOf(reviews()[0].type(reviews()[0].props)),/أقول بوضوح ما أحتاجه وما يزعجني في العلاقة/);
  assert.equal(find(tree,'اعتماد الملخص').props.disabled,true);
  nodes(reviews()[1].type(reviews()[1].props)).find(node=>node.type==='select').props.onChange({target:{value:'B'}});tree=ui.render();
  assert.equal(find(tree,'اعتماد الملخص').props.disabled,false);find(tree,'اعتماد الملخص').props.onClick();await tick();ui.render();
  assert.deepEqual(ui.applied[0].map(({fieldId,values})=>({fieldId,values})),[{fieldId:'directness',values:['D']},{fieldId:'openness',values:['B']}]);ui.unmount();
});

test('manual fallback is available only after the server confirms a recoverable failure', async () => {
  const initial={document:{...baseDocument(),status:'review',currentQuestion:null,proposals:[proposal],pendingAnalysis:true},revision:2};
  const without=mount(initial);without.render();await tick();assert.equal(find(without.render(),'إكمال الأسئلة مباشرة'),undefined);without.unmount();
  const ui=mount({...initial,fallbackAvailable:true});ui.render();await tick();let tree=ui.render();assert.ok(find(tree,'إكمال الأسئلة مباشرة'));find(tree,'إكمال الأسئلة مباشرة').props.onClick();assert.equal(ui.closed,1);ui.unmount();
});

test('a successful retry hides the old failure receipt and restores the composer',async()=>{
 const initial={document:{...baseDocument(),pendingAnalysis:true},revision:2,fallbackAvailable:true};
 const ui=mount(initial,(payload,snapshot)=>payload.action==='retry'?Promise.resolve({...snapshot,revision:3,document:{...snapshot.document,pendingAnalysis:false,lastMode:'luna'}}):null);
 ui.render();await tick();let tree=ui.render();
 assert.match(textOf(tree),/تعذّر إكمال الحوار الآن/);assert.ok(find(tree,'إكمال الأسئلة مباشرة'));assert.equal(nodes(tree).find(node=>node.type==='textarea').props.disabled,true);
 find(tree,'إعادة المحاولة').props.onClick();await tick();tree=ui.render();
 assert.doesNotMatch(textOf(tree),/تعذّر إكمال الحوار الآن/);assert.equal(find(tree,'إكمال الأسئلة مباشرة'),undefined);assert.equal(nodes(tree).find(node=>node.type==='textarea').props.disabled,false);
 ui.unmount();
});

test('closing during model processing is allowed and never commits answers to the profile', async () => {
  const waiting=deferred();const initial={document:baseDocument(),revision:1};
  const ui=mount(initial,payload=>payload.action==='answer'?waiting.promise:null);ui.render();await tick();let tree=ui.render();
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'أبغى نرتب خطوتنا مع الأهل'}});tree=ui.render();sendAction(tree).props.onClick();tree=ui.render();
  const close=nodes(tree).find(node=>node.props?.['aria-label']==='حفظ وإغلاق الجلسة');assert.equal(close.props.disabled,false);close.props.onClick();assert.equal(ui.closed,1);
  waiting.resolve({document:{...initial.document,draftAnswer:''},revision:2});await tick();ui.render();assert.equal(ui.applied.length,0);ui.unmount();
});

test('a late confirmation response after leaving the account cannot update the profile', async () => {
  const waiting=deferred();const document={...baseDocument(),status:'review',currentQuestion:null,proposals:[proposal]};
  const ui=mount({document,revision:2},payload=>payload.action==='confirm'?waiting.promise:null);ui.render();await tick();let tree=ui.render();
  find(tree,'اعتماد الملخص').props.onClick();ui.render();ui.unmount();
  waiting.resolve({document:{...document,status:'confirmed',confirmed:[proposal]},revision:3});await tick();assert.equal(ui.applied.length,0);
});

test('an uncertain send retries the same request ID without dropping the written answer', async () => {
  let attempts=0;const initial={document:baseDocument(),revision:1};
  const ui=mount(initial,payload=>payload.action==='answer'&&++attempts===1?Promise.reject(new Error('انقطع الاتصال')):null);ui.render();await tick();let tree=ui.render();
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'أتمنى نتفق على توقيت مناسب'}});tree=ui.render();sendAction(tree).props.onClick();tree=ui.render();assert.equal(nodes(tree).filter(node=>node.props?.className?.includes('wi-new-answer')).length,1);await tick();tree=ui.render();assert.equal(nodes(tree).filter(node=>node.props?.className?.includes('wi-new-answer')).length,0);
  assert.equal(nodes(tree).find(node=>node.type==='textarea').props.value,'أتمنى نتفق على توقيت مناسب');sendAction(tree).props.onClick();await tick();ui.render();
  const sends=ui.calls.filter(call=>call.action==='answer');assert.equal(sends.length,2);assert.equal(sends[0].requestId,sends[1].requestId);ui.unmount();
});

test('an unfinished analysis cannot be applied or shared; the direct questionnaire remains available', async () => {
  const document={...baseDocument(),status:'review',currentQuestion:null,pendingAnalysis:true,proposals:[proposal]};
  const ui=mount({document,revision:2,fallbackAvailable:true});ui.render();await tick();let tree=ui.render();
  assert.equal(find(tree,'اعتماد الملخص').props.disabled,true);
  const sharing=nodes(tree).find(node=>node.type==='label'&&node.props.className==='wi-sharing');assert.equal(nodes(sharing).find(node=>node.type==='input').props.disabled,true);
  assert.ok(find(tree,'إعادة المحاولة'));assert.ok(find(tree,'إكمال الأسئلة مباشرة'));assert.equal(ui.applied.length,0);ui.unmount();
});

test('Continue pressed during autosave waits for its revision and sends the newest draft exactly once', async () => {
  const waiting=deferred();const initial={document:baseDocument(),revision:1};
  const ui=mount(initial,payload=>payload.action==='draft'?waiting.promise:null);ui.render();await tick();let tree=ui.render();
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'إجابة أولى'}});ui.render();ui.timers();tree=ui.render();
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'إجابة أحدث جاهزة للإرسال'}});tree=ui.render();
  const send=sendAction(tree);assert.equal(send.props.disabled,false);send.props.onClick();send.props.onClick();ui.render();
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


test('existing explicit analysis consent starts the conversation without another checkbox', async () => {
  const ui=mount({document:null,revision:0});ui.render({consentGranted:true});await tick();ui.render();await tick();const tree=ui.render();
  assert.deepEqual(ui.calls.map(call=>call.action),['load','start']);assert.equal(ui.applied.length,0);assert.equal(nodes(tree).filter(node=>node.type==='input'&&node.props.type==='checkbox').length,0);assert(!/OpenAI|Luna|gpt-/i.test(textOf(tree)));ui.unmount();
});

test('the server coverage gate blocks applying an incomplete required assessment', async () => {
  const ui=mount({document:{...baseDocument(),status:'review',currentQuestion:null,proposals:[proposal]},revision:2,coverage:{answered:1,required:44}});ui.render();await tick();const tree=ui.render();
  assert.equal(find(tree,'اعتماد الملخص').props.disabled,true);assert.ok(find(tree,'إكمال الحوار'));assert.equal(ui.applied.length,0);ui.unmount();
});


test('a failed confirmation reloads the pending server state so retry is offered without granting manual fallback', async () => {
  const initial={document:{...baseDocument(),status:'review',currentQuestion:null,proposals:[proposal]},revision:2};let failed=false;
  const ui=mount(initial,payload=>{
    if(payload.action==='confirm'){failed=true;return Promise.reject(new Error('تعذّر حفظ نتيجة التحليل'));}
    if(payload.action==='load'&&failed)return Promise.resolve({...initial,revision:3,document:{...initial.document,pendingAnalysis:true},fallbackAvailable:false});
    return null;
  });
  ui.render();await tick();find(ui.render(),'اعتماد الملخص').props.onClick();await tick();const tree=ui.render();
  assert.equal(ui.calls.filter(call=>call.action==='load').length,2);assert.equal(find(tree,'اعتماد الملخص').props.disabled,true);assert.ok(find(tree,'إعادة المحاولة'));assert.equal(find(tree,'إكمال الأسئلة مباشرة'),undefined);assert.equal(ui.applied.length,0);ui.unmount();
});


test('fallback reviews extracted answers once and preserves only resolved choices without confirming a partial AI assessment', async () => {
  const partial=[];const unclear={...proposal,id:'p2',fieldId:'residence_plan',needsClarification:true};
  const ui=mount({document:{...baseDocument(),pendingAnalysis:true,proposals:[proposal,unclear]},revision:2,fallbackAvailable:true,coverage:{answered:1,required:44}});
  ui.render({onFallbackApply:value=>partial.push(clone(value))});await tick();find(ui.render(),'إكمال الأسئلة مباشرة').props.onClick();let tree=ui.render();
  assert.match(textOf(tree),/نكمل من حيث وصلنا/);assert.equal(ui.closed,0);assert.equal(partial.length,0);assert.equal(find(tree,'اعتماد الملخص'),undefined);
  find(tree,'اعتماد ما راجعته وإكمال المتبقي').props.onClick();tree=ui.render();
  assert.equal(partial.length,1);assert.deepEqual(partial[0].map(item=>item.id),['p1']);assert.equal(ui.calls.filter(call=>call.action==='confirm').length,0);assert.equal(ui.applied.length,0);assert.equal(ui.closed,1);ui.unmount();
});


test('pending active analysis offers retry without a manual bypass or another answer submission', async () => {
  const ui=mount({document:{...baseDocument(),pendingAnalysis:true},revision:2,fallbackAvailable:false});ui.render();await tick();const tree=ui.render();
  assert.ok(find(tree,'إعادة المحاولة'));assert.equal(find(tree,'إكمال الأسئلة مباشرة'),undefined);assert.equal(nodes(tree).find(node=>node.type==='textarea').props.disabled,true);assert.equal(sendAction(tree).props.disabled,true);ui.unmount();
});


test('sending immediately shows one pending reply, then replaces it with the acknowledged turn', async () => {
  const waiting=deferred(),initial={document:baseDocument(),revision:1};
  const ui=mount(initial,payload=>payload.action==='answer'?waiting.promise:null);ui.render();await tick();let tree=ui.render();
  const answer='أحب نسمع بعض بهدوء ونوصل إلى اتفاق';nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:answer}});tree=ui.render();sendAction(tree).props.onClick();tree=ui.render();
  assert.equal(nodes(tree).find(node=>node.type==='textarea').props.value,'');assert.equal(sendAction(tree).props.disabled,true);
  assert.equal(nodes(tree).filter(node=>node.props?.className?.includes('wi-new-answer')).length,1);assert.match(textOf(tree),/جارٍ الإرسال/);
  const sent=ui.calls.find(call=>call.action==='answer');
  waiting.resolve({document:{...initial.document,lastRequestId:sent.requestId,turns:[{id:'sent-turn',topic:'intent',question:initial.document.currentQuestion.text,answer,skipped:false}],currentQuestion:{topic:'family',text:'وماذا عن وقتكم مع الأهل؟',suggestions:[]}},revision:2});await tick();tree=ui.render();
  assert.equal(nodes(tree).filter(node=>node.props?.className?.includes('wi-new-answer')).length,0);
  const log=nodes(tree).find(node=>node.props?.role==='log');assert.equal(nodes(log).filter(node=>node.type==='p'&&textOf(node)===answer).length,1);assert.match(textOf(log),/وماذا عن وقتكم مع الأهل/);ui.unmount();
});

test('a lost response recovered from the server does not duplicate or restore an already-delivered reply', async () => {
  const initial={document:baseDocument(),revision:1};let sent;
  const ui=mount(initial,payload=>{
    if(payload.action==='answer'){sent=payload;return Promise.reject(new Error('انقطع الاتصال'));}
    if(payload.action==='load'&&sent)return Promise.resolve({document:{...initial.document,lastRequestId:sent.requestId,turns:[{id:'delivered-turn',topic:'intent',question:initial.document.currentQuestion.text,answer:sent.answer,skipped:false}],currentQuestion:{topic:'family',text:'كيف تحب ترتيب وقت الأهل؟',suggestions:[]}},revision:2});
    return null;
  });
  ui.render();await tick();let tree=ui.render();nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'نرتب موعدًا يناسبنا'}});tree=ui.render();sendAction(tree).props.onClick();await tick();tree=ui.render();
  assert.equal(nodes(tree).find(node=>node.type==='textarea').props.value,'');assert.equal(nodes(tree).filter(node=>node.props?.className?.includes('wi-new-answer')).length,0);
  const log=nodes(tree).find(node=>node.props?.role==='log');assert.equal(nodes(log).filter(node=>node.type==='p'&&textOf(node)==='نرتب موعدًا يناسبنا').length,1);assert.equal(ui.calls.filter(call=>call.action==='answer').length,1);ui.unmount();
});


test('sending follows the new turn, while reading history during processing preserves the reader position', async () => {
  const waiting=deferred(),initial={document:baseDocument(),revision:1};const ui=mount(initial,payload=>payload.action==='answer'?waiting.promise:null);
  ui.render();await tick();let tree=ui.render();const scrolls=[];
  const viewport={scrollHeight:2400,scrollTop:0,clientHeight:400,scrollTo(value){this.scrollTop=value.top;scrolls.push(value.top);}};
  nodes(tree).find(node=>node.props?.role==='log').props.ref.current=viewport;
  ui.render({open:false});ui.render({open:true});tree=ui.render();assert.equal(scrolls.length,1,'opening the conversation starts at its latest turn');
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'أحب الوضوح في علاقتنا'}});tree=ui.render();sendAction(tree).props.onClick();tree=ui.render();assert.equal(scrolls.length,2,'own send follows the pending reply');
  viewport.scrollTop=100;nodes(tree).find(node=>node.props?.role==='log').props.onScroll({currentTarget:viewport});
  const sent=ui.calls.find(call=>call.action==='answer');waiting.resolve({document:{...initial.document,lastRequestId:sent.requestId,turns:[{id:'new',topic:'intent',question:initial.document.currentQuestion.text,answer:sent.answer,skipped:false}],currentQuestion:{topic:'family',text:'كيف تتصور وقت العائلة؟',suggestions:[]}},revision:2});await tick();ui.render();
  assert.equal(viewport.scrollTop,100);assert.equal(scrolls.length,2,'arrival does not pull someone away from earlier answers');ui.unmount();
});

const capturedProfile={id:'profile:partnerCriteria.dressStyle',fieldId:'partnerCriteria.dressStyle',values:['niqab'],mode:'prefer',exclude:false,summary:'تفضّل شريكة ترتدي النقاب',evidence:[{turnId:'t2',quote:'أفضّل منقبة'}],needsClarification:false};
test('message captures show profile additions and require one review before applying the draft',async()=>{
 const initial={document:baseDocument(),revision:1,coverage:{answered:0,required:44}};
 const ui=mount(initial,(payload,snapshot)=>payload.action==='answer'?Promise.resolve({document:{...snapshot.document,turns:[{id:'t2',topic:'intent',question:'ما تفضيلاتك؟',answer:payload.answer,skipped:false}],profileProposals:[capturedProfile],lastRequestId:payload.requestId},revision:2,coverage:{answered:0,required:44}}):payload.action==='profileConfirm'?Promise.resolve({document:{...snapshot.document,profileProposals:[capturedProfile],profileConfirmed:[capturedProfile]},revision:3}):null);
 ui.render({profileContext:[{fieldId:'city',values:['الرياض'],mode:null,exclude:false}],assessmentContext:[{id:'preference:children_plan:self',values:['A']}]});await tick();let tree=ui.render();
 nodes(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'أفضّل منقبة'}});tree=ui.render();sendAction(tree).props.onClick();await tick();tree=ui.render();
 assert.match(textOf(tree),/أُضيف للملخص/);assert.equal(ui.profileApplied.length,0);
 assert.equal(ui.calls.find(p=>p.action==='answer').profileContext[0].fieldId,'city');assert.equal(ui.calls.find(p=>p.action==='answer').assessmentContext.length,1);
 find(tree,'تفاصيل لملفك وتفضيلاتك').props.onClick();tree=ui.render();assert.match(textOf(tree),/لا تُنشر قبل إرسال الملف/);
 find(tree,'تفاصيل إلى مسودتي').props.onClick();await tick();ui.render();
 assert.equal(ui.calls.filter(p=>p.action==='profileConfirm').length,1);assert.deepEqual(ui.calls.at(-1).profileChoices,[{id:capturedProfile.id,values:['niqab'],mode:'prefer',exclude:false}]);
 assert.equal(ui.profileApplied.length,1);
 ui.unmount();
});
test('a correction is distinguished from a newly captured field and pending analysis never claims success',async()=>{
 const old={...capturedProfile,evidence:[{turnId:'t1',quote:'أفضّل منقبة'}]};
 const initial={document:{...baseDocument(),profileProposals:[old],turns:[{id:'t1',topic:'intent',question:'ما تفضيلاتك؟',answer:'أفضّل منقبة',skipped:false}]},revision:1};
 const ui=mount(initial,(payload,snapshot)=>payload.action==='answer'?Promise.resolve({...snapshot,revision:2,document:{...snapshot.document,turns:[...snapshot.document.turns,{id:'t2',topic:'intent',question:'هل تود التوضيح؟',answer:payload.answer,skipped:false}],profileProposals:[{...capturedProfile,values:['hijab']}],lastRequestId:payload.requestId}}):null);
 ui.render();await tick();let tree=ui.render();nodes(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'أفضّل الحجاب'}});tree=ui.render();sendAction(tree).props.onClick();await tick();tree=ui.render();assert.match(textOf(tree),/تغيّر/);assert.doesNotMatch(textOf(tree),/أُضيف للملخص/);ui.unmount();
 const pending=mount(initial,(payload,snapshot)=>payload.action==='answer'?Promise.resolve({...snapshot,revision:2,document:{...snapshot.document,pendingAnalysis:true,lastRequestId:payload.requestId}}):null);
 pending.render();await tick();tree=pending.render();nodes(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'أفضّل الحجاب'}});tree=pending.render();sendAction(tree).props.onClick();await tick();tree=pending.render();assert.equal(nodes(tree).filter(n=>n.props?.className==='wi-message-captures').length,0);pending.unmount();
});
test('loading previous profile confirmations cannot overwrite newer manual draft edits',async()=>{
 const ui=mount({document:{...baseDocument(),profileProposals:[capturedProfile],profileConfirmed:[capturedProfile]},revision:4});
 ui.render();await tick();ui.render();ui.render();assert.equal(ui.profileApplied.length,0);assert.equal(ui.applied.length,0);ui.unmount();
});
test('unclear unrestricted criteria and sensitive disclosures are not silently approved',async()=>{
 for(const proposal of [
  {...capturedProfile,id:'profile:partnerCriteria.sharedLanguage',fieldId:'partnerCriteria.sharedLanguage',values:[],mode:'any',needsClarification:true},
  {...capturedProfile,id:'profile:marriageBasics.religiousAffiliation',fieldId:'marriageBasics.religiousAffiliation',values:['sunni'],mode:null},
 ]){
  const ui=mount({document:{...baseDocument(),profileProposals:[proposal]},revision:1});ui.render();await tick();let tree=ui.render();find(tree,'تفاصيل لملفك وتفضيلاتك').props.onClick();tree=ui.render();assert.equal(find(tree,'تفاصيل إلى مسودتي').props.disabled,true);assert.equal(ui.profileApplied.length,0);ui.unmount();
 }
});
