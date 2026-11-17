import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await readFile(new URL('../src/membership/Membership.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exports={};
vm.runInNewContext(code,{exports,require:name=>name==='react/jsx-runtime'?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:name.endsWith('.css')?{}:new Proxy({},{get:(_,key)=>key})});
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
const noop=()=>{};
function screen(extra={}){return exports.Membership({active:false,demo:false,price:'149.99 SAR',currency:'SAR',gender:'man',canStart:true,canBuy:true,busy:false,trialEligible:true,expiry:null,back:noop,buy:noop,restore:noop,manage:noop,refresh:noop,onPolicy:noop,...extra});}
const button=(tree,className)=>nodes(tree).find(n=>n.type==='button'&&n.props.className?.includes(className));

test('free trial requires a loaded offer and all purchasing gates remain effective',()=>{
 assert.match(text(screen()),/٧ أيام مجانًا/);
 for(const state of [{price:null},{canStart:false},{canBuy:false},{busy:true}])assert.equal(Boolean(button(screen(state),'wd-purchase').props.disabled),true);
 const missing=screen({price:null});assert.doesNotMatch(text(missing),/٧ أيام مجانًا|null/);assert.match(text(missing),/تحديث عرض العضوية/);
 assert.doesNotMatch(text(screen({trialEligible:false})),/٧ أيام مجانًا/);
});
test('existing subscribers see management rather than an unverified new-customer renewal price',()=>{
 let managed=0;const tree=screen({active:true,manage:()=>managed++,expiry:'2027-01-01T00:00:00Z'});
 assert.doesNotMatch(text(tree),/149.99|٧ أيام مجانًا|المتابعة مجانًا/);
 assert.match(text(tree),/سارية حتى/);button(tree,'wd-purchase').props.onClick();assert.equal(managed,1);
});
test('restore and policy remain available while price retrieval fails',()=>{
 let restores=0,policies=0;const tree=screen({price:null,canStart:false,restore:()=>restores++,onPolicy:()=>policies++});
 const buttons=nodes(tree).filter(n=>n.type==='button');
 const restore=buttons.find(n=>text(n)==='استعادة المشتريات');assert.equal(Boolean(restore.props.disabled),false);restore.props.onClick();
 buttons.find(n=>text(n)==='الشروط والخصوصية').props.onClick();assert.equal(restores,1);assert.equal(policies,1);
});
