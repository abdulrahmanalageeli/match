// Actual App, discovery, billing and cloud adapters with local Supabase and StoreKit fixtures.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE||'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output=resolve(root,'.tmp/onboarding-app-state');
await mkdir(output,{recursive:true});

const app=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '/src/App';
import {demoProfile} from '/src/community/data';
import '/src/design.css';import '/src/flows.css';import '/src/screens.css';import '/src/motion.css';import '/src/typography.css';
const gender=new URLSearchParams(location.search).get('gender')==='woman'?'woman':'man';
const id='fixture-'+gender;
window.__state=JSON.parse(sessionStorage.getItem(id)||'null')??{
 user:{id,email:id+'@example.test',applicationStatus:'pending',appAccountToken:'account-'+id,paused:false},
 profile:{...demoProfile,gender},membership:{active:false,canStart:false,tier:'free',connectionLimit:1,status:'free',expiresAt:null},introduction:null
};
window.__calls=[];window.__issued=null;window.__purchaseMode='cancel';
window.__peer={id:gender==='man'?'fixture-woman':'fixture-man',alias:gender==='man'?'سارة':'سعود',gender:gender==='man'?'woman':'man',age:29,city:'الرياض',occupation:'مهندس',bio:'أقدّر الحوار الهادئ.',interests:[],reasons:[],marriageBasics:{},eligible:true,online:true};
createRoot(document.getElementById('root')).render(<App/>);
`;
const fakeSupabase=`
const state=()=>window.__state;
function answer(name,params){
 const member=state();
 switch(name){
  case 'marriage_social_onboarding_status':return {required:false};
  case 'marriage_state':return structuredClone(member);
  case 'marriage_unread_count':return 0;
  case 'marriage_inbox':case 'marriage_notifications':case 'marriage_conversation_pilot_notices':case 'marriage_request_history':return [];
  case 'marriage_browse':{
    if(member.user.applicationStatus!=='approved')throw Error('Pending member requested discovery');
    window.__calls.push({action:'browse',tier:member.membership.tier,mode:params.options.mode});
    return [{...window.__peer,...(member.membership.active?{fit:{version:'marriage-v4',percentage:82,covered:32,total:32,assessmentComplete:true,provisional:false,strengths:[],discussion:[],missing:[]}}:{compatibilityLocked:true})}];
  }
  case 'marriage_note_profile_open':return null;
  default:throw Error('Unimplemented fixture RPC '+name);
 }
}
export function createClient(){
 return {
  auth:{getSession:async()=>({data:{session:{user:state().user,access_token:'fixture-only'}}}),getUser:async()=>({data:{user:state().user}})},
  channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:async()=>{},
  rpc(name,params){
   const result=Promise.resolve().then(()=>({data:answer(name,params),error:null}));
   result.abortSignal=()=>result;
   return result;
  },
  functions:{async invoke(name,{body}){
   const member=state();
   if(name==='membership-offer'&&member.user.applicationStatus==='approved'&&body.signedAppTransaction==='fixture-app-sandbox'){
    window.__calls.push({action:'authorize',...body});
    return {data:{productId:body.productId,eligible:false,sandboxCheckout:true,accountToken:member.user.appAccountToken,eligibilityJws:'fixture-authorization-'+body.productId}};
   }
   if(name==='verify-membership'&&window.__issued?.jws===body.signedTransaction&&window.__issued.accountToken===member.user.appAccountToken){
    const {productId}=window.__issued;
    const tier=productId.includes('seriousness')?'seriousness':'premium';
    member.membership={active:true,canStart:false,status:'paid',tier,connectionLimit:tier==='seriousness'?3:2,expiresAt:null};
    window.__calls.push({action:'verified',productId,jws:body.signedTransaction});
    sessionStorage.setItem(member.user.id,JSON.stringify(member));
    return {data:structuredClone(member)};
   }
   throw Error('Unexpected fixture function '+name);
  }}
 };
}
`;
const fakeStore=`
export const Capacitor={getPlatform:()=> 'ios',isNativePlatform:()=>true};
const prices={'com.blindmatch.marriage.monthly.men':'149.99 SAR','com.blindmatch.marriage.monthly.women':'99.99 SAR','com.blindmatch.marriage.monthly.seriousness':'299.99 SAR','com.blindmatch.marriage.monthly.seriousness.women':'199.99 SAR'};
export function registerPlugin(name){
 if(name!=='AppleMembership')throw Error('Unexpected native plugin '+name);
 return {
  async offer({productId}){
   if(!prices[productId])throw Error('Unknown product');
   return {productId,price:prices[productId],currency:'SAR',period:'شهر',appleEligible:false,signedAppTransaction:'fixture-app-sandbox'};
  },
  async purchase({accountToken,productId,eligibilityJws,price}){
   if(accountToken!==window.__state.user.appAccountToken||eligibilityJws!=='fixture-authorization-'+productId||prices[productId]!==price)throw Error('Invalid purchase parameters');
   window.__calls.push({action:'purchase',productId,accountToken,mode:window.__purchaseMode});
   if(window.__purchaseMode==='cancel')throw Error('أُلغي الشراء في المتجر.');
   const jws='fixture-tx-'+accountToken+'-'+productId;
   window.__issued={jws,productId,accountToken};return {jws};
  },
  async complete({jws}){
   if(!window.__calls.some(c=>c.action==='verified'&&c.jws===jws))throw Error('Finished before verification');
   window.__calls.push({action:'complete',jws});
  },
  async current(){return {jws:null}},async addListener(){return {remove(){}}}
 };
}
`;

const virtualApp='\0app-state';
const virtualCloud='\0app-state-cloud';
const virtualStore='\0app-state-store';
const server=await createServer({root,configFile:resolve(root,'vite.config.ts'),cacheDir:resolve(root,'node_modules/.vite-app-state-qa'),
 define:{'import.meta.env.VITE_MARRIAGE_ENV':JSON.stringify('staging'),'import.meta.env.VITE_MARRIAGE_SUPABASE_URL':JSON.stringify('https://fixturetest.supabase.co'),'import.meta.env.VITE_MARRIAGE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('sb_publishable_fixture_only')},
 server:{host:'127.0.0.1',port:5294,strictPort:true},
 plugins:[{name:'local-app-state-boundaries',enforce:'pre',
  resolveId(id,importer=''){
   const file=importer.replaceAll('\\','/');
   if(id==='virtual:app-state')return virtualApp;
   if(id==='@supabase/supabase-js'&&file.endsWith('/src/cloud.ts'))return virtualCloud;
   if(id==='@capacitor/core'&&file.endsWith('/src/billing.ts'))return virtualStore;
  },
  async load(id){
   if(id===virtualCloud)return fakeSupabase;
   if(id===virtualStore)return fakeStore;
   if(id===virtualApp)return (await transformWithEsbuild(app,'app-state.tsx',{loader:'tsx',jsx:'automatic'})).code;
   if(id.replaceAll('\\','/').endsWith('/src/motion/SkiaSurface.tsx'))return "import{createElement}from'react';export function SkiaSurface({className,fallback}){return createElement('div',{className,'aria-hidden':true},fallback)}";
  },
  configureServer(dev){
   dev.middlewares.use('/__app-state',async(req,res)=>{
    res.setHeader('Content-Type','text/html');
    res.end(await dev.transformIndexHtml('/__app-state','<!doctype html><html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/@id/__x00__app-state"></script></html>'));
   });
  }
 }]});
await server.listen();
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 for(const [gender,plan,productId,expectedPrice,peer] of [
  ['man','premium','com.blindmatch.marriage.monthly.men','149.99 SAR','سارة'],
  ['woman','seriousness','com.blindmatch.marriage.monthly.seriousness.women','199.99 SAR','سعود']
 ]){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ar-SA'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);
  const external=[];await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='127.0.0.1'||url.protocol==='data:')return route.continue();
   external.push(url.origin);return route.abort();
  });
  try{
   await page.goto('http://127.0.0.1:5294/__app-state?gender='+gender,{waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'طلبك قيد المراجعة'}).waitFor();
   assert.equal(await page.locator('.df-discovery,.wd-paywall').count(),0);
   await page.screenshot({path:resolve(output,gender+'-pending.png')});
   await page.evaluate(()=>{window.__state.user.applicationStatus='approved'});
   await page.getByRole('button',{name:'تحديث حالة الطلب'}).tap();
   const directory=page.locator('.df-discovery');
   await directory.locator('.wd-membership-entry[data-tier=free]').waitFor();
   await directory.getByRole('button',{name:'عرض ملف '+peer,exact:true}).waitFor();
   if(plan==='premium')await directory.getByRole('button',{name:'عرض العضوية لفتح نسبة التوافق'}).tap();
   else{
    await directory.getByRole('button',{name:'ابحث مع لونا'}).tap();
    await directory.getByRole('button',{name:'اكتشف وسام الجدية'}).tap();
   }
   const paywall=page.locator('.wd-paywall-'+plan);
   await paywall.locator('.wd-plan-choice button[aria-pressed=true]').waitFor();
   const buy=paywall.locator('.wd-purchase');
   await page.waitForFunction(()=>document.querySelector('.wd-purchase')?.disabled===false);
   assert((await paywall.locator('.wd-price-row').innerText()).includes(expectedPrice));
   await page.screenshot({path:resolve(output,gender+'-offer.png')});
   await buy.tap();await page.getByRole('alert').filter({hasText:'أُلغي الشراء في المتجر.'}).waitFor();
   assert.equal(await page.evaluate(()=>window.__state.membership.active),false);
   assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.action==='verified'||c.action==='complete').length),0);
   await page.evaluate(()=>{window.__purchaseMode='ok'});await buy.tap();
   await directory.locator('.wd-membership-entry[data-tier='+plan+']').waitFor();
   await page.locator('.wd-tier-change[data-tier='+plan+'] [role=status]').waitFor();
   const fit=directory.getByRole('button',{name:new RegExp('توافق التفضيلات مع '+peer)});
   await fit.waitFor();await page.screenshot({path:resolve(output,gender+'-app-entry.png')});
   assert.equal(await page.locator('.wd-paywall').count(),0);
   const calls=await page.evaluate(()=>window.__calls);
   assert.deepEqual(calls.filter(c=>c.action==='purchase').map(c=>[c.productId,c.mode]),[[productId,'cancel'],[productId,'ok']]);
   const claims=calls.filter(c=>c.action==='authorize'&&c.claim);
   assert.equal(claims.length,2);
   assert(claims.every(c=>c.productId===productId&&c.sandboxOnly===true));
   assert.deepEqual(calls.filter(c=>['purchase','verified','complete'].includes(c.action)).map(c=>c.action),['purchase','purchase','verified','complete']);
   assert(calls.some(c=>c.action==='browse'&&c.tier==='free')&&calls.some(c=>c.action==='browse'&&c.tier===plan));
   await fit.tap();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
   await page.reload({waitUntil:'domcontentloaded'});await directory.locator('.wd-membership-entry[data-tier='+plan+']').waitFor();
   assert.equal(await page.locator('.wd-tier-change').count(),0,'a restored session does not announce a new purchase');
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   console.log('PASS '+gender+' '+plan+': pending, approved free discovery, cancel, sandbox-authorized retry, verification before finish, paid matching and retained app entry');
  }catch(error){
   console.error(gender,errors,external,await page.locator('body').innerText().catch(()=>''));throw error;
  }finally{await page.close();}
 }
}finally{await browser?.close();await server.close();}
