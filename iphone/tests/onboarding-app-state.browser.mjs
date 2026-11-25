// Actual App, discovery, billing and cloud adapters with local Supabase and StoreKit fixtures.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE||'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output=resolve(root,'.tmp/onboarding-app-state');
await mkdir(output,{recursive:true});
const mainEntry=await readFile(resolve(root,'src/main.tsx'),'utf8');
const appStyles=Array.from(mainEntry.matchAll(/^import\s+['"]\.\/([^'"]+\.css)['"]/gm),
 match=>"import '/src/"+match[1]+"';").join('\n');

const app=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '/src/App';
import {demoProfile} from '/src/community/data';
import {initialDraft} from '/src/onboarding/draft';
import {intakeVault} from '/src/onboarding/persistence';
import {dimensionsForVersion,practicalAnswerKeys} from '/src/compatibility/model';
import {personalityQuestionsFor} from '/src/compatibility/personality';
import {initializeDevicePreferences} from '/src/settings/preferences';
${appStyles}
initializeDevicePreferences();
const gender=new URLSearchParams(location.search).get('gender')==='woman'?'woman':'man';
const journey=new URLSearchParams(location.search).get('journey')||'pending';
const id=gender==='man'?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222';
window.__journey=journey;
const stageId='synthetic-portrait-'+gender;
const stagePhoto={id:stageId,path:'fixture.jpg',blur:gender==='woman'?100:0,revealPolicy:'never'};
window.__stage=['verified','recovery','private'].includes(journey)?{id:stageId,status:gender==='man'?'verified':'ready',portrait:stagePhoto}:null;
window.__state=JSON.parse(sessionStorage.getItem(id)||'null')??{
 user:{id,email:id+'@example.test',applicationStatus:journey==='pending'?'pending':'draft',appAccountToken:'account-'+id,paused:false},
 profile:journey==='pending'?{...demoProfile,gender}:null,membership:{active:false,canStart:false,tier:'free',connectionLimit:1,status:'free',expiresAt:null},introduction:null
};
if(journey==='gift'){
 window.__state.user.applicationStatus='approved';
 window.__state.profile={...demoProfile,gender};
 window.__state.membership={active:true,status:'granted',tier:'premium',connectionLimit:2};
 window.__state.membershipNotice={id:'fixture-grant',source:'staff',kind:'grant',tier:'premium',
  startsAt:new Date(Date.now()-86400000).toISOString(),endsAt:new Date(Date.now()+30*86400000).toISOString()};
}
window.__holdFinalization=journey==='verified';
window.__failFinalization=journey==='recovery'&&!sessionStorage.getItem('photo-retry');
window.__calls=[];window.__issued=null;window.__purchaseMode='cancel';
window.__peer={id:gender==='man'?'fixture-woman':'fixture-man',alias:gender==='man'?'سارة':'سعود',gender:gender==='man'?'woman':'man',age:29,city:'الرياض',occupation:gender==='man'?'مهندسة':'مهندس',bio:'أقدّر الحوار الهادئ.',interests:[],reasons:[],marriageBasics:{},eligible:true,online:true};
async function start(){
 if(window.__state.user.applicationStatus==='draft'){
  const draft=initialDraft(id,null);
  draft.step='review';
  draft.permissions={version:'2026-11-07-privacy',assessment:true,sensitiveProfile:true,sensitivePublication:true};
  Object.assign(draft.answers,{displayName:gender==='man'?'سعود':'سارة',gender,age:'28',birthDate:'1998-05-12',city:'الرياض',
    profession:'التقنية والبرمجة',education:'بكالوريوس',bio:'نبذة تجريبية عن الحياة والاهتمامات',lookingFor:'شريك متفهم',lifeTogether:'حياة هادئة',marriageIntent:'الزواج',valuesStatement:'الاحترام',contact:id+'@example.test',familyPreference:'من البداية',
    marriageBasics:{maritalStatus:'never_married',polygynyPreference:'not_open',heightCm:165,weightKg:65,skinTone:'tone_4',dressStyle:'hijab',dressFlexibility:'keep',spokenLanguages:['العربية'],preferredLanguage:'العربية',languageOpenness:'flexible',nationality:'سعودي',childrenCount:0,smoking:'never',marriageTimeline:'when_ready',meetingPreference:'discuss_together',tribalBackground:'prefer_not_to_say',religiousAffiliation:'prefer_not_to_say',prayerPractice:'prefer_not_to_say'},
    partnerCriteria:Object.fromEntries(['sharedLanguage','height','weight','nationality','education','profession','maritalStatus','children','smoking'].map(k=>[k,{mode:'any'}])),
    membershipReadiness:{family:'early',nextStep:'soon',agreement:'wudayn-membership-v1'},
    surveyAnswers:Object.fromEntries(dimensionsForVersion(draft.answers.assessmentVersion).flatMap(d=>practicalAnswerKeys(d,draft.answers.assessmentVersion).map(key=>[key,d.options[0].code]))),
    personalityAnswers:Object.fromEntries(personalityQuestionsFor(draft.answers.personalityVersion).map(q=>[q.id,'C']))});
  await intakeVault.save(draft,intakeVault.revision(id));
 }
 createRoot(document.getElementById('root')).render(<App/>);
}
void start();
`;
const fakeSupabase=`
const state=()=>window.__state;
function answer(name,params){
 const member=state();
 switch(name){
  case 'marriage_social_onboarding_status':return {required:false};
  case 'marriage_state':return structuredClone(member);
  case 'wudayn_ack_membership_notice':
   window.__calls.push({action:'ack',id:params.notice_id});
   return new Promise((resolve,reject)=>{
    window.__failGiftAck=()=>reject(Error('Offline'));
    window.__acceptGiftAck=()=>{member.membershipNotice=null;resolve(null);};
   });
  case 'marriage_onboarding_draft':
   if(params.command==='save')window.__draft=structuredClone(params.payload);
   if(params.command==='delete')window.__draft=null;
   return params.command==='load'?window.__draft:null;
  case 'marriage_apply':{
   const p=params.payload;
   if(member.user.applicationStatus!=='draft'||p._applicationIntegrity!=='wudayn-application-integrity-v1'||!p.signupConsents?.sensitivePublication||!p._membershipReadiness?.agreement)throw Error('Unexpected application');
   if(Boolean(window.__stage)!==p.signupConsents.photo)throw Error('Unexpected photo selection');
   member.profile={...p};
   member.user.applicationStatus=window.__stage||window.__journey==='staff-hold'?'pending':'approved';
   if(window.__journey==='follow-up')window.__staffFollowup='open_safety_report';
   window.__calls.push({action:'apply',status:member.user.applicationStatus,photo:p.signupConsents.photo,avatar:Boolean(p.publicAvatar)});
   sessionStorage.setItem(member.user.id,JSON.stringify(member));
   return structuredClone(member);
  }
  case 'marriage_portrait_stage_resume':return member.profile?.portrait?null:window.__stage;
  case 'marriage_portrait_stage_action':{
   if(params.action!=='finalize'||params.photo!==window.__stage?.id||!member.profile?.signupConsents.photo)throw Error('Unexpected finalization');
   window.__calls.push({action:'finalize',id:params.photo});
   if(window.__failFinalization){sessionStorage.setItem('photo-retry','1');throw Error('تعذّر حفظ الصورة.');}
   return (async()=>{
    if(window.__holdFinalization)await new Promise(resolve=>{window.__releaseFinalization=resolve});
    member.profile.portrait=window.__stage.portrait;
    member.user.applicationStatus='approved';
    sessionStorage.setItem(member.user.id,JSON.stringify(member));
    return structuredClone(member.profile.portrait);
   })();
  }
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
  storage:{from:()=>({download:async()=>({data:new Blob(['synthetic'],{type:'image/jpeg'})})})},
  rpc(name,params){
   const result=Promise.resolve().then(async()=>({data:await answer(name,params),error:null}));
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
async function submitRestoredDraft(page) {
 const review=page.locator('main[data-chapter=review]');
 await review.getByRole('checkbox',{name:/أقرّ بصدق إجاباتي/}).waitFor();
 for(const box of await review.locator('.nf-consent-review > .nf-consent-choice input').all())await box.check();
 await review.getByRole('checkbox',{name:/أقرّ بصدق إجاباتي/}).check();
 await review.getByRole('button',{name:'إرسال طلب العضوية',exact:true}).tap();
}
async function localPage(page) {
 const errors=[],external=[];
 page.setDefaultTimeout(30000);
 page.setDefaultNavigationTimeout(90000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1'&&url.pathname==='/api/interview')return route.fulfill({json:{document:null,revision:0,fallbackAvailable:true}});
  if(url.hostname==='127.0.0.1'||['blob:','data:'].includes(url.protocol))return route.continue();
  external.push(url.origin);return route.abort();
 });
 return {errors,external};
}
async function captureDiscovery(page,filename){
 await page.evaluate(async()=>{
  // Returning from checkout can restore the previous feed scroll position.
  window.scrollTo({top:0,behavior:'instant'});
  await document.fonts.ready;
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  await frame();
  const animations=document.getAnimations().filter(animation=>animation.playState==='running'&&
   Number.isFinite(animation.effect?.getComputedTiming().endTime));
  await Promise.allSettled(animations.map(animation=>animation.finished));
  await frame();
 });
 await page.locator('.df-recommendation .df-profile-hitbox').first().waitFor({state:'attached'});
 const layout=await page.evaluate(()=>{
  for(let el=document.querySelector('.df-header');el;el=el.parentElement){
   if(el.scrollTop)el.scrollTo({top:0,behavior:'instant'});
  }
  const rect=selector=>document.querySelector(selector).getBoundingClientRect();
  const toolbar=document.querySelector('.dr-tools'),hitbox=document.querySelector('.df-profile-hitbox');
  const search=rect('.dr-search-toggle'),filter=rect('.dr-filter-shortcut'),card=rect('.df-recommendation'),hit=hitbox.getBoundingClientRect();
  const header=rect('.df-header'),tabs=rect('.df-feed-tabs'),identity=rect('.df-portrait-identity');
  const noticeBottom=document.querySelector('.wd-tier-change')?.getBoundingClientRect().bottom??0;
  return {atTop:document.scrollingElement.scrollTop===0&&header.top>=noticeBottom-1&&tabs.top>=header.bottom-1,
   identityVisible:identity.top>tabs.bottom&&identity.bottom<=innerHeight,
   opacity:getComputedStyle(toolbar).opacity,aligned:Math.abs(search.y-filter.y)<1,
   controlsUsable:[search,filter].every(box=>box.width>=44&&box.height>=44),
   hitboxPosition:getComputedStyle(hitbox).position,hitboxBorder:getComputedStyle(hitbox).borderTopStyle,
   coversCard:Math.abs(hit.width-card.width)<=2&&Math.abs(hit.height-card.height)<=2};
 });
 assert.deepEqual(layout,{atTop:true,identityVisible:true,opacity:'1',aligned:true,controlsUsable:true,hitboxPosition:'absolute',hitboxBorder:'none',coversCard:true});
 await page.screenshot({path:resolve(output,filename)});
}
async function runChecks(){
 browser=await chromium.launch({headless:true,channel:'chrome'});
 await checkGiftReceipt();
 if(process.argv.includes('--gift-receipt'))return;
 for(const [gender,plan,productId,expectedPrice,peer] of [
  ['man','premium','com.blindmatch.marriage.monthly.men','149.99 SAR','سارة'],
  ['woman','seriousness','com.blindmatch.marriage.monthly.seriousness.women','199.99 SAR','سعود']
 ]){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ar-SA'});
  const {errors,external}=await localPage(page);
  try{
   const journey=gender==='man'?'verified':'avatar';
   await page.goto('http://127.0.0.1:5294/__app-state?gender='+gender+'&journey='+journey,{waitUntil:'domcontentloaded'});
   await submitRestoredDraft(page);
   if(gender==='man'){
    await page.waitForFunction(()=>typeof window.__releaseFinalization==='function');
    assert.equal(await page.getByRole('heading',{name:'طلبك قيد المراجعة'}).count(),0);
    assert.equal(await page.locator('.df-discovery,.wd-paywall').count(),0);
    await page.evaluate(()=>window.__releaseFinalization());
   }
   const directory=page.locator('.df-discovery');
   await directory.locator('.wd-membership-entry[data-tier=free]').waitFor();
   await directory.getByRole('button',{name:'عرض ملف '+peer,exact:true}).waitFor();
   assert.equal(await page.locator('.wd-tier-change').count(),0);
   await captureDiscovery(page,gender+'-app-entry.png');
   assert.deepEqual(await page.evaluate(()=>window.__calls.filter(c=>c.action==='apply'||c.action==='finalize').map(c=>c.action)),gender==='man'?['apply','finalize']:['apply']);
   if(gender==='woman')assert(await page.evaluate(()=>window.__calls.find(c=>c.action==='apply').avatar));
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
   await fit.waitFor();await captureDiscovery(page,gender+'-after-upgrade.png');
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
   console.log('PASS '+gender+' '+plan+': final form submission, automatic approval, immediate free discovery, cancel, sandbox-authorized retry, verification before finish, paid matching and retained app entry');
  }catch(error){
   console.error(gender,errors,external,await page.locator('body').innerText().catch(()=>''));throw error;
  }finally{await page.close();}
 }
 for(const [gender,journey] of [['woman','private'],['man','recovery'],['woman','follow-up'],['woman','staff-hold']]){
  const page=await browser.newPage({viewport:{width:375,height:667},isMobile:true,hasTouch:true,locale:'ar-SA'});
  const {errors,external}=await localPage(page);
  try{
   await page.goto('http://127.0.0.1:5294/__app-state?gender='+gender+'&journey='+journey,{waitUntil:'domcontentloaded'});
   await submitRestoredDraft(page);
   if(journey==='recovery'){
    await page.getByRole('heading',{name:'بقي حفظ صورتك'}).waitFor();
    assert.equal(await page.locator('.df-discovery,.wd-paywall').count(),0);
    assert.equal(await page.getByRole('heading',{name:'طلبك قيد المراجعة'}).count(),0);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'إعادة محاولة حفظ الصورة'}).tap();
   } else if(journey==='staff-hold'){
    await page.getByRole('heading',{name:'طلبك قيد المراجعة'}).waitFor();
    assert.equal(await page.locator('.df-discovery,.wd-paywall').count(),0);
    await page.screenshot({path:resolve(output,'woman-pending.png')});
    await page.getByRole('button',{name:'تحديث حالة الطلب'}).tap();
    assert.equal(await page.locator('.df-discovery').count(),0);
    await page.evaluate(()=>{window.__state.user.applicationStatus='approved';window.dispatchEvent(new Event('focus'))});
   }
   await page.locator('.df-discovery .wd-membership-entry[data-tier=free]').waitFor();
   assert.equal(await page.getByRole('button',{name:'إعادة محاولة حفظ الصورة'}).count(),0);
   if(journey==='follow-up'){
    assert.equal(await page.evaluate(()=>window.__staffFollowup),'open_safety_report');
    assert.equal(await page.getByRole('heading',{name:'طلبك قيد المراجعة'}).count(),0);
    assert.equal(await page.getByText('open_safety_report').count(),0);
   }
   if(journey==='private'||journey==='recovery'){
    assert(await page.evaluate(()=>window.__state.profile.portrait.id===window.__stage.id));
    assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.action==='finalize').length),1);
   }
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   console.log('PASS '+gender+' '+journey+': server status enforced through free app entry');
  }catch(error){console.error(journey,errors,external,await page.locator('body').innerText().catch(()=>''));throw error;}
  finally{await page.close();}
 }
}

async function checkGiftReceipt(){
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ar-SA'});
 const {errors,external}=await localPage(page);
 try {
  await page.addInitScript(()=>{
   window.CapacitorCustomPlatform={name:'ios'};
   window.Capacitor={
    PluginHeaders:[{name:'PrivateSession',methods:['read','save','clear','privacyStatus','setCaptureScope'].map(name=>({name,rtype:'promise'}))}],
    async nativePromise(plugin,method){
     if(method==='read')return {token:null};
     if(method==='privacyStatus')return {available:true,enabled:false,delay:60,biometry:'Face ID'};
     return {};
    }
   };
   window.__closedGift=[];
   const close=HTMLDialogElement.prototype.close;
   HTMLDialogElement.prototype.close=function(...args){
    if(this.open&&this.matches('.wd-membership-receipt'))window.__closedGift.push(this.isConnected);
    return close.apply(this,args);
   };
  });
  await page.goto('http://127.0.0.1:5294/__app-state?journey=gift',{waitUntil:'domcontentloaded'});
  const guide=page.locator('.wd-overview'), gift=page.locator('dialog.wd-membership-receipt[open]');
  const unlock=page.locator('dialog.device-unlock-offer[open]');
  await guide.waitFor();
  assert.equal(await gift.count(),0,'the gift waits for the first-open tour');
  await guide.getByRole('button',{name:'تخطّي الجولة'}).tap();
  await gift.getByText('هدية عضوية من وُدَين').waitFor();
  assert.equal(await unlock.count(),0,'Face ID waits for the gift');
  await gift.getByRole('button',{name:'متابعة',exact:true}).tap();
  await gift.waitFor({state:'detached'});
  assert.deepEqual(await page.evaluate(()=>window.__closedGift),[true],'release the modal before detaching its element');
  assert.equal(await unlock.count(),0,'Continue returns to the app without another startup dialog');
  const directory=page.locator('.df-discovery');
  const all=directory.getByRole('button',{name:'جميع الملفات',exact:true});
  await all.tap();
  await directory.locator('.dr-row-profile').first().waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__calls.filter(c=>c.action==='ack').map(c=>c.id)),['fixture-grant']);
  await page.evaluate(()=>window.__failGiftAck());
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>window.__calls.filter(c=>c.action==='ack'&&c.id==='fixture-grant').length===2);
  await directory.getByRole('button',{name:'ترشيحات لك',exact:true}).tap();
  await directory.getByRole('button',{name:'عرض ملف سارة',exact:true}).waitFor();
  assert.equal(await gift.count(),0,'a failed acknowledgement and a stale refresh do not reopen the receipt');
  await page.evaluate(()=>window.__acceptGiftAck());
  async function interruptExit(action,button){
   await page.evaluate(action=>{
    window.__interruptedExit=false;
    document.addEventListener('click',()=>{
     const exit=document.getAnimations().find(animation=>animation.effect?.getKeyframes().some(frame=>frame.clipPath?.includes('14px')));
     if(exit){exit[action]();window.__interruptedExit=true;}
    },{once:true});
   },action);
   await button.tap();
   assert.equal(await page.evaluate(()=>window.__interruptedExit),true,'the tab exit animation was interrupted');
  }
  const nav=page.getByRole('navigation',{name:'التنقل الرئيسي'});
  await interruptExit('cancel',nav.getByRole('button',{name:'الإشعارات',exact:true}));
  await page.getByRole('heading',{name:'الإشعارات',exact:true}).waitFor();
  await interruptExit('pause',nav.getByRole('button',{name:'استكشف',exact:true}));
  await directory.waitFor();
  await page.evaluate(()=>{
   window.__state.membershipNotice={id:'fixture-peer-gift',source:'member',tier:'premium',kind:'grant',
     startsAt:new Date(Date.now()-86400000).toISOString(),endsAt:new Date(Date.now()+30*86400000).toISOString()};
   window.dispatchEvent(new Event('focus'));
  });
  await gift.getByText('وصلتك هدية عضوية').waitFor();
  await gift.getByRole('button',{name:'متابعة',exact:true}).tap();
  await page.waitForFunction(()=>window.__calls.some(c=>c.action==='ack'&&c.id==='fixture-peer-gift'));
  await page.evaluate(()=>window.__acceptGiftAck());
  await all.tap();
  await directory.locator('.dr-row-profile').first().waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS returning member: tour, gifted membership, Face ID, delayed/failed acknowledgement and interrupted tab navigation without reopening the app');
 } catch(error){
  console.error('Gift receipt fixture',errors,external,await page.locator('body').innerText().catch(()=>''));
  throw error;
 } finally {await page.close();}
}
try{await runChecks();}finally{await browser?.close();await server.close();}
