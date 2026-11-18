import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as pricing from '../src/membershipPricing.ts';
const source=await readFile(new URL('../src/membership/Membership.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exports={};
let rendering;
const hooks={
 useState(initial){const owner=rendering,index=owner.cursor++;if(!(index in owner.state))owner.state[index]=typeof initial==='function'?initial():initial;return [owner.state[index],value=>{const next=typeof value==='function'?value(owner.state[index]):value;if(!Object.is(next,owner.state[index])){owner.state[index]=next;owner.dirty=true}}]},
 useEffect(effect,deps){const owner=rendering,index=owner.cursor++,previous=owner.effects[index];if(!previous||deps.some((value,i)=>!Object.is(value,previous.deps[i]))){owner.effects[index]={deps,cleanup:previous?.cleanup};owner.pending.push(()=>{owner.effects[index].cleanup?.();owner.effects[index].cleanup=effect()})}},
};
vm.runInNewContext(code,{exports,require:name=>name==='react'?hooks:name==='react/jsx-runtime'?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:name==='../membershipPricing'?pricing:name==='../billing'?{getMembershipOffer:()=>Promise.reject(Error('Offer unavailable'))}:name.endsWith('.css')?{}:new Proxy({},{get:(_,key)=>key})});
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
const noop=()=>{};
function mount(extra={}){
 const instance={state:[],effects:[],pending:[],cursor:0,dirty:true};let tree;
 const props={active:false,demo:false,price:'149.99 SAR',currency:'SAR',period:'شهر',gender:'man',canStart:true,canBuy:true,busy:false,trialEligible:true,expiry:null,back:noop,buy:noop,restore:noop,manage:noop,refresh:noop,onPolicy:noop,...extra};
 return {get tree(){while(instance.dirty){instance.dirty=false;instance.cursor=0;rendering=instance;tree=exports.Membership(props);rendering=undefined;for(const effect of instance.pending.splice(0))effect()}return tree},async settle(){await Promise.resolve();await Promise.resolve();return this.tree},update(patch){Object.assign(props,patch);instance.dirty=true;return this.tree},unmount(){for(const effect of instance.effects)effect?.cleanup?.()}};
}
function screen(extra={}){return mount(extra).tree;}
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

test('active Premium may choose a higher tier, but checkout waits for its Apple offer',async()=>{
 let resolveOffer;const calls=[],purchases=[];
 const offer={gender:'man',price:'299.99 SAR',currency:'SAR',period:'شهر',trialEligible:false,productId:pricing.SERIOUSNESS_PRODUCT};
 const view=mount({active:true,currentTier:'premium',canStart:false,buy:(...args)=>purchases.push(args),loadOffer:(...args)=>{calls.push(args);return new Promise(resolve=>{resolveOffer=resolve})}});
 assert.match(text(button(view.tree,'wd-purchase')),/إدارة الاشتراك/);
 nodes(view.tree).find(n=>n.type==='button'&&n.props['aria-pressed']===false).props.onClick();
 assert.equal(button(view.tree,'wd-purchase').props.disabled,true);
 assert.deepEqual(calls,[['man','seriousness']]);
 resolveOffer(offer);const ready=await view.settle();
 assert.equal(Boolean(button(ready,'wd-purchase').props.disabled),false);
 assert.doesNotMatch(text(ready),/٧ أيام مجانًا/);
 button(ready,'wd-purchase').props.onClick();assert.equal(purchases.length,1);
 assert.equal(purchases[0][0],'seriousness');assert.equal(purchases[0][1],offer);
 view.unmount();
});

test('failed or obsolete higher-tier offers cannot enable purchase',async()=>{
 const resolvers=[];let rejectOffer;
 const view=mount({loadOffer:()=>new Promise((resolve,reject)=>{resolvers.push(resolve);rejectOffer=reject})});
 nodes(view.tree).find(n=>n.type==='button'&&n.props['aria-pressed']===false).props.onClick();void view.tree;
 rejectOffer(Error('offline'));const failed=await view.settle();
 assert.match(text(nodes(failed).find(n=>n.props.className==='wd-price-row')),new RegExp(pricing.seriousnessPriceLabel('man')));
 assert.match(text(failed),/تعذّر تحميل وسام الجدية/);assert.equal(button(failed,'wd-purchase').props.disabled,true);
 nodes(failed).find(n=>n.type==='button'&&n.props['aria-pressed']===false).props.onClick();void view.tree;
 nodes(view.tree).find(n=>n.type==='button'&&n.props['aria-pressed']===false).props.onClick();void view.tree;
 view.update({gender:'woman'});
 resolvers[1]({price:'299.99 SAR',gender:'man'});await view.settle();
 assert.equal(button(view.tree,'wd-purchase').props.disabled,true,'obsolete gender response is ignored');
 resolvers[2]({price:'199.99 SAR',period:'شهر',gender:'woman'});await view.settle();
 assert.equal(Boolean(button(view.tree,'wd-purchase').props.disabled),false);view.unmount();
});

test('existing Seriousness members manage their subscription instead of buying again',async()=>{
 let managed=0,bought=0;const view=mount({active:true,currentTier:'seriousness',canStart:false,manage:()=>managed++,buy:()=>bought++,loadOffer:async()=>({price:'299.99 SAR',gender:'man'})});
 await view.settle();const tree=view.tree;
 assert.match(text(tree),/عضوية فعّالة/);assert.doesNotMatch(text(tree),/٧ أيام مجانًا|299.99|المتابعة مجانًا/);
 assert.equal(nodes(tree).some(n=>n.props?.className==='wd-plan-choice'),false);
 button(tree,'wd-purchase').props.onClick();assert.equal(managed,1);assert.equal(bought,0);view.unmount();
});
