import memberAr from '../src/member-ar.json' with { type: 'json' };
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {applicableDimensions,hasPartnerQuestion,practicalAnswerKeys} from '../src/compatibility/practical-catalog.ts';
import catalog from '../src/compatibility/catalog.json' with { type: 'json' };
import scenarios from '../src/beena/catalog.json' with { type: 'json' };
import { hasPreferenceAnswer, hasScenarioAnswer } from '../src/onboarding/remainingAssessments.ts';

const compile = source => ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const codes = Object.fromEntries(await Promise.all(['compatibility/CompatibilityFields','beena/BeenaFields'].map(async path=>[path.split('/')[1],compile(await readFile(new URL('../src/'+path+'.tsx',import.meta.url),'utf8'))])));
const text = node => typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):text(node?.props?.children??'');
const nodes = node => Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'?[node,...nodes(node.props?.children)]:[];
const byClass=(tree,name)=>nodes(tree).find(node=>node.props?.className?.split(' ').includes(name));
const preferences=()=>Object.fromEntries(catalog.dimensions.flatMap(d=>practicalAnswerKeys(d).map(key=>[key,d.options[0].code])));
const beena=()=>({version:'beena-v1',answers:Object.fromEntries(scenarios.map(s=>[s.id,{self:s.options[0].code,partner:[s.options[0].code],importance:2}]))});

function mount(name, initial) {
  let props={...initial},cursor=0,changed=false;const hooks=[],effects=[],calls=[];
  const react={useId:()=> 'fixture',useRef:value=>{const at=cursor++;return hooks[at]??={current:value}},useState:value=>{const at=cursor++;if(!(at in hooks))hooks[at]=typeof value==='function'?value():value;return[hooks[at],next=>{const result=typeof next==='function'?next(hooks[at]):next;if(result!==hooks[at]){hooks[at]=result;changed=true}}]},useLayoutEffect:(fn,deps)=>{const at=cursor++,old=hooks[at];if(!old||deps.some((v,i)=>v!==old[i])){hooks[at]=deps;effects.push(fn)}}};
  const exports={},icons=new Proxy({},{get:()=>()=>null});
  const require=name=>{
    if (name === '../member-copy.ts') return { default: memberAr };
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return{jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key})};
    if(name==='../BrandIcons')return icons;
    if(name==='../onboarding/remainingAssessments')return{hasPreferenceAnswer,hasScenarioAnswer};
    if(name==='./model')return{name:'fixture',categories:catalog.categories,applicableDimensions,hasPartnerQuestion,practicalAnswerKeys, dimensions:catalog.dimensions,interests:[],maxInterests:3,maxPriorities:2,beenaScenarios:scenarios,beenaVersion:'beena-v1',beenaProgress:value=>{const answered=scenarios.filter(s=>hasScenarioAnswer(s.options,value?.answers[s.id],'self')&&hasScenarioAnswer(s.options,value?.answers[s.id],'partner')).length;return{answered,total:scenarios.length,complete:answered===scenarios.length}}};
    if(name==='../ui/SheetChoiceSelect')return{SheetChoiceSelect:()=>null};
    if(name.endsWith('.css'))return{};throw Error(name);
  };
  vm.runInNewContext(codes[name],{exports,require,document:{documentElement:{dataset:{}}},window:{matchMedia:()=>({matches:false})}});
  props.onChange=next=>{calls.push(next);props=name==='CompatibilityFields'?{...props,...next}:{...props,value:next};changed=true};
  return{calls,get props(){return props},render(next={}){props={...props,...next};let tree,passes=0;do{changed=false;cursor=0;tree=exports[name](props);effects.splice(0).forEach(fn=>fn());assert(++passes<20)}while(changed);return tree}};
}

test('coverage requires valid choices and validates each scenario perspective independently',()=>{
  const options=[{code:'A'},{code:'B'}];
  assert.equal(hasPreferenceAnswer(options,'unknown'),false);
  assert.equal(hasScenarioAnswer(options,{self:'A'},'self'),true);
  assert.equal(hasScenarioAnswer(options,{self:'A'},'partner'),false);
  assert.equal(hasScenarioAnswer(options,{partner:['A','B']},'partner'),true);
  assert.equal(hasScenarioAnswer(options,{partner:['A','bad']},'partner'),false);
  assert.equal(hasScenarioAnswer(options,{partner:['A','A']},'partner'),false);
});

test('remaining preferences ask only the missing side and do not drop selected answers before advancing',()=>{
  const surveyAnswers=preferences(),dimension=catalog.dimensions[0];delete surveyAnswers[dimension.partnerId];
  const ui=mount('CompatibilityFields',{surveyAnswers,interestIds:[],hardRequirements:[],priorityCategories:[],registration:true,remainingOnly:true});let tree=ui.render();
  assert.equal(text(nodes(tree).find(node=>node.type==='h3')),dimension.partnerPrompt);
  assert.equal(nodes(byClass(tree,'compat-perspective')).filter(node=>node.type==='button').length,1);
  nodes(byClass(tree,'compat-answer-options')).find(node=>node.type==='button').props.onClick();tree=ui.render();
  assert.ok(byClass(tree,'compat-question-workspace'),'current answer stays reviewable until advancing');
  byClass(tree,'compat-next').props.onClick();tree=ui.render();
  assert.equal(byClass(tree,'compat-question-workspace'),undefined);
  assert.ok(text(tree).includes('تفضيلاتك مكتملة'));
  assert.ok(text(tree).includes('أولوياتك وشروطك الاختيارية'));
  assert.equal(ui.props.surveyAnswers[dimension.id],surveyAnswers[dimension.id]);
});

test('prefilled preferences show no repeated questions and full editing remains available',()=>{
  const ui=mount('CompatibilityFields',{surveyAnswers:preferences(),interestIds:[],hardRequirements:[],priorityCategories:[],registration:true,remainingOnly:true});
  assert.equal(byClass(ui.render(),'compat-question-workspace'),undefined);
  assert.ok(byClass(ui.render({remainingOnly:false}),'compat-question-workspace'));
});

test('Beena is optional Q&A with no third-score or scenario workflow',()=>{
 const value=beena(),original=JSON.stringify(value);
 const ui=mount('BeenaFields',{value});let tree=ui.render();
 assert.equal(byClass(tree,'bn-scene'),undefined);
 assert.equal(byClass(tree,'bn-progress'),undefined);
 assert.equal(byClass(tree,'bn-modes'),undefined);
 const input=nodes(tree).find(node=>node.type==='textarea');
 input.props.onChange({target:{value:'نتعاون حسب الوقت المتاح لكل طرف.'}});tree=ui.render();
 assert.equal(ui.props.value.story.share,false);
 assert.equal(ui.props.value.story.text,'نتعاون حسب الوقت المتاح لكل طرف.');
 assert.equal(JSON.stringify(ui.props.value.answers),JSON.stringify(value.answers));
 assert.equal(JSON.stringify(value),original,'old private answers remain unchanged');
 const share=nodes(tree).find(node=>node.type==='input'&&node.props.type==='checkbox');
 share.props.onChange({target:{checked:true}});tree=ui.render();
 assert.equal(ui.props.value.story.share,true);
 nodes(tree).find(node=>node.type==='button'&&text(node).includes('حذف الإجابة')).props.onClick();ui.render();
 assert.equal(ui.props.value.story,undefined);
 assert.equal(JSON.stringify(ui.props.value.answers),JSON.stringify(value.answers));
});
