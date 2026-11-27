// Actual discovery/settings components, synthetic people; no production requests.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const root=process.cwd(), output=resolve(root,'.tmp/discovery-refinement');
await mkdir(output,{recursive:true});
const fixture=`
import React from 'react';import {createRoot} from 'react-dom/client';
import {Discovery} from '/src/community/Community.tsx';
import {CapturePrivacyHost} from '/src/privacy/CapturePrivacy.tsx';
import {Settings} from '/src/settings/Settings.tsx';
import {MembershipAccess} from '/src/membership/access.tsx';
import {Membership} from '/src/membership/Membership.tsx';
import {MembershipChangeNotice} from '/src/membership/MembershipEntry.tsx';
import {dimensions} from '/src/compatibility/model.ts';
import '/src/design.css';import '/src/flows.css';import '/src/screens.css';import '/src/motion.css';
import '/src/community/arrivalDiscovery.css';import '/src/arrivalSurfaces.css';import '/src/typography.css';
const people=['سارة','ريم','لولو','نورة','مها'].map((alias,i)=>({id:'p'+i,alias,age:28+i,city:'الرياض',online:i%2===0,occupation:'مهندسة',bio:'أقدّر الوضوح والحوار وأبحث عن شراكة هادئة.',interests:[],reasons:[],marriageBasics:{marriageTimeline:'three_to_six_months'},demoPhoto:'/demo/portraits/reem-realistic-v2.webp',fit:{version:'marriage-v4',strengths:dimensions.map(item=>item.id),discussion:[],missing:[],assessmentComplete:true,provisional:false,covered:dimensions.length,total:dimensions.length,percentage:72-i*3}}));
people[0].recommendationPercentage=65;people[0].fit.practicalConcerns=['children_intent'];people[1].fit.provisional=true;people[2].compatibilityLocked=true;people[3].fit.percentage=0;people[3].eligible=false;
people[0].membershipTier='premium';people[1].membershipTier='seriousness';
people[0].manualVerifications=[{id:'fixture-marital-status',kind:'marital_status',label:'الحالة الاجتماعية',reviewedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),isTest:false}];
Object.assign(people[1].fit,{covered:7,total:16,assessmentComplete:false,percentage:null});
people[4].isDemo=true;people[4].online=false;people[4].demoPhoto='/demo/portraits/missing.webp';window.__interest=[];window.__failInterest=false;
window.__trackPullRows=()=>{window.__pullRowReads=0;for(const person of people){
 const tier=person.membershipTier;Object.defineProperty(person,'membershipTier',{configurable:true,get(){window.__pullRowReads++;return tier;}});
}};
window.__filters=[];const source={discover:async(f)=>{window.__filters.push(f);return f.search==='لا يوجد'?[]:people.filter(person=>person.eligible!==false||f.mode==='all'&&!f.eligibleOnly);},inbox:async()=>[],watch:()=>()=>{},setInterest:async(id,value)=>{window.__interest.push({id,value});if(window.__failInterest)throw Error('تعذّر إرسال الاهتمام');const index=people.findIndex(p=>p.id===id);people[index]={...people[index],interested:value};},verification:async()=>({claims:[],requests:new URLSearchParams(location.search).has('legacy')?[{id:'old'}]:[]}),request:async()=>{throw Error('not part of fixture')}};
const discover=source.discover;
source.discover=async filters=>{await window.__directoryRefreshGate;return discover(filters);};
if(location.search.includes('slowProfile')){
 const listeners=new Set();
 source.watch=listener=>{listeners.add(listener);return ()=>listeners.delete(listener);};
 window.__wakeProfile=()=>listeners.forEach(listener=>listener());
 window.__accessReads=[];
 source.profileVisible=()=>new Promise(resolve=>window.__accessReads.push(resolve));
}
source.blockPerson=async()=>{throw Error('not part of fixture')};
if (location.search.includes('protectedPhotos')) {
 people[2].alias='لولو بنت عبدالرحمن العبدالله';
 people[0].portrait={id:'synthetic-portrait',path:'fixture',blur:0,revealed:true};
 people[1].publicAvatar={style:'hijab',skinTone:'tone_3'};
 source.portraitUrl=async()=>'/demo/portraits/reem-realistic-v2.webp';
}
const noop=()=>{};const settings=new URLSearchParams(location.search).has('settings');
function Fixture(){
 const [initialPlan,openOffer]=React.useState(null);
 const [tier,setTier]=React.useState(new URLSearchParams(location.search).has('free')?'free':'premium');
 window.__setTier=setTier;
 const premium=tier!=='free';
 return <MembershipAccess.Provider value={{tier,premium,upgrade:(plan='premium')=>openOffer(plan)}}>
  <div className="phone-app"><MembershipChangeNotice tier={tier}/>
   {initialPlan?<Membership initialPlan={initialPlan} gender="woman" currentTier={tier} active={premium} demo={false}
    canBuy={false} canStart={false} busy={false} price={null} expiry={null} back={()=>openOffer(null)}
    buy={noop} restore={noop} manage={noop} refresh={noop} onPolicy={noop}/>:<main className="app-screen cm-shell" dir="rtl">{settings?<Settings demo state={null} demoMember={{displayName:'عبدالرحمن',city:'الرياض',age:30}} paused={false} busy={false} source={source} onEdit={noop} onMembership={noop} onToggle={noop} onDelete={noop} onExit={noop} onPrivacy={noop}/>:<Discovery source={source} onInbox={noop} onConversation={noop} onAccount={noop}/>}</main>}</div>
 </MembershipAccess.Provider>;
}
createRoot(document.getElementById('root')).render(<><Fixture/><CapturePrivacyHost/></>);
`;
const server=await createServer({root,configFile:resolve(root,'vite.config.ts'),cacheDir:'node_modules/.vite-discovery-refinement',server:{host:'127.0.0.1',port:5281,strictPort:true},
 plugins:[{name:'local-discovery-fixture',enforce:'pre',resolveId(id){if(id==='virtual:discovery-fixture')return '\0discovery-fixture'},
 async load(id){if(id==='\0discovery-fixture')return(await transformWithEsbuild(fixture,'fixture.tsx',{loader:'tsx',jsx:'automatic'})).code;},
 transform(code,id){if(id.replaceAll('\\','/').endsWith('/community/Community.tsx'))return code+'\nexport {Discovery};';},
 configureServer(dev){dev.middlewares.use(async(req,res,next)=>{if(req.url?.startsWith('/__discovery-fixture')){res.setHeader('Content-Type','text/html');res.end(await dev.transformIndexHtml('/__discovery-fixture','<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/__x00__discovery-fixture"></script></body></html>'));return;}next();});}}]});
await server.listen();let browser,page;const errors=[];
async function checkDirectoryPull() {
 const surface = page.locator('.dr-directory');
 const indicator = surface.locator('.dr-pull-indicator');
 assert.equal(await surface.getByRole('button',{name:'تحديث الملفات'}).count(),0);
 await page.evaluate(()=>{window.scrollTo({top:0,behavior:'instant'});window.__trackPullRows();});
 const touch = async (type, down) => surface.evaluate((element,{type,down})=>{
   const finger=new Touch({identifier:1,target:element,clientX:165,clientY:80+down});
   const touches=type==='touchend'||type==='touchcancel'?[]:[finger];
   element.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches,changedTouches:[finger]}));
 },{type,down});
 const pullCalls = () => page.evaluate(()=>window.__filters.length);
 const callsBefore = await pullCalls();
 await touch('touchstart',0);
 await touch('touchmove',80);
 await indicator.getByText('اسحب للتحديث',{exact:true}).waitFor();
 assert.equal(await indicator.evaluate(element=>element.style.height),'38.4px');
 await touch('touchmove',110);
 await indicator.getByText('أفلت للتحديث',{exact:true}).waitFor();
 assert.equal(await indicator.evaluate(element=>element.style.height),'52.8px');
 await page.waitForFunction(()=>{
   const portraits=[...document.querySelectorAll('.dr-row-avatar [data-portrait-state="ready"]')]
     .map(element=>element.getBoundingClientRect()).filter(rect=>rect.top>=0 && rect.bottom<=innerHeight);
   return portraits.length>0 && portraits.every(rect=>[...window.__portraits.values()].some(box=>
     [rect.x+scrollX,rect.y+scrollY,rect.width,rect.height].every((value,i)=>Math.abs(value-box[i])<1)));
 });
 await indicator.screenshot({path:resolve(output,'pull-armed.png')});
 assert.equal(await page.evaluate(()=>window.__pullRowReads),0,'drag frames must not rerender the directory rows');
 await touch('touchcancel',110);
 await page.waitForFunction(()=>document.querySelector('.dr-pull-content').style.paddingTop==='0px');
 assert.equal(await pullCalls(),callsBefore,'a cancelled pull must not refresh');
 await touch('touchstart',0);
 await touch('touchmove',50);
 await touch('touchend',50);
 assert.equal(await pullCalls(),callsBefore,'short pulls must not refresh');
 await touch('touchstart',0);
 await touch('touchmove',190);
 await page.waitForFunction(()=>document.querySelector('.dr-pull-content').style.paddingTop==='88px');
 await page.evaluate(()=>{window.__directoryRefreshGate=new Promise(resolve=>{window.__finishRefresh=resolve;});});
 await touch('touchend',190);
 await indicator.getByText('جارٍ تحديث الملفات…',{exact:true}).waitFor();
 assert.equal(await indicator.evaluate(element=>element.style.height),'48px');
 await page.evaluate(()=>{window.__finishRefresh();delete window.__directoryRefreshGate;});
 await page.waitForFunction(()=>document.querySelector('.dr-pull-content').style.paddingTop==='0px');
 assert.equal(await pullCalls(),callsBefore+1,'one completed pull refreshes once');
 const clickSuppressed = await surface.evaluate(element=>!element.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));
 assert.ok(clickSuppressed,'a completed drag suppresses its following click');
}
async function openProfileAtMembershipSeal(row){
 const button=row.getByRole('button',{name:/عرض ملف/});
 await button.scrollIntoViewIfNeeded();
 const [hitbox,seal]=await Promise.all([button.boundingBox(),row.locator('.dr-row-avatar > .wd-member-badge').boundingBox()]);
 assert.ok(hitbox && seal,'profile button and membership seal are visible');
 await button.click({position:{x:seal.x+seal.width/2-hitbox.x,y:seal.y+seal.height/2-hitbox.y}});
}
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:5281/__discovery-fixture?slowProfile');
 await page.getByRole('button',{name:'عرض ملف سارة'}).click({position:{x:20,y:20}});
 await page.getByText('جارٍ فتح الملف…').waitFor();
 await page.waitForFunction(()=>window.__accessReads.length===1);
 await page.evaluate(()=>{window.__filters=[];for(let i=0;i<8;i++)window.__wakeProfile();});
 assert.equal(await page.evaluate(()=>window.__accessReads.length),1);
 assert.equal(await page.locator('.mp-profile h1').count(),0);
 await page.evaluate(()=>window.__accessReads[0](true));
 await page.waitForFunction(()=>window.__accessReads.length===2);
 await page.evaluate(()=>window.__accessReads[1](true));
 await page.locator('.mp-profile h1').waitFor();
 for(const tab of ['التفاصيل','التوافق','نبذة']){
   const button=page.locator('.mp-profile').getByRole('button',{name:tab,exact:true});
   await button.click();
   assert.equal(await button.getAttribute('aria-pressed'),'true');
 }
 const refreshes=await page.evaluate(()=>window.__filters);
 assert(refreshes.length>0 && refreshes.every(f=>f.subjectId==='p0'));
 await page.evaluate(()=>window.__wakeProfile());
 await page.waitForFunction(()=>window.__accessReads.length>=3);
 await page.evaluate(()=>window.__accessReads.at(-1)(false));
 await page.getByText('الملف غير متاح.',{exact:true}).waitFor();
 console.log('Passed: eight update signals coalesced behind one validation, profile-only refresh, all tabs and revocation.');
 await page.goto('http://127.0.0.1:5281/__discovery-fixture',{waitUntil:'domcontentloaded',timeout:60000});const weekly=page.locator('.df-recommendation').first();
 await weekly.getByRole('button',{name:'عرض ملف سارة'}).click({position:{x:20,y:20}});
 const memberProfile=page.locator('.mp-profile');
 const details=memberProfile.getByRole('button',{name:'التفاصيل',exact:true});
 await details.click();
 assert.equal(await details.getAttribute('aria-pressed'),'true');
 const verificationBadge=memberProfile.getByRole('button',{name:/الحالة الاجتماعية.*عرض نطاق التوثيق وصلاحيته/});
 assert.equal(await verificationBadge.getAttribute('aria-haspopup'),'dialog');
 assert.equal(await verificationBadge.evaluate(button=>button.parentElement.closest('button')===null),true);
 await verificationBadge.click();
 const verification=page.getByRole('dialog',{name:'بيانات تمت مراجعتها'});
 await verification.getByText('الحالة الاجتماعية',{exact:true}).first().waitFor();
 await verification.getByRole('button',{name:'إغلاق تفاصيل التوثيق'}).click();
 await memberProfile.locator('.mp-back').click();
 console.log('Passed: the interactive verification badge opens its scoped claim from التفاصيل.');
 await weekly.waitFor();
 assert.equal(await page.locator('html[data-capture-scope],.wd-capture-trigger,.wd-capture-watermark,.wd-capture-note').count(),0);
 await page.emulateMedia({media:"print"});
 assert.equal(await weekly.isVisible(),true,'web print keeps the recommendation visible');
 await page.emulateMedia({media:"screen"});
 const percent = value => new Intl.NumberFormat('ar-SA',{style:'percent',numberingSystem:'arab'}).format(value/100).replace(/[\u061c\u200e\u200f]/g,'');
 const scoreText = async tile => (await tile.locator('.nf-score-tile strong').innerText()).replace(/[\u061c\u200e\u200f]/g,'');
 assert.equal(await scoreText(weekly),percent(72));
 await weekly.getByText('تختلف رغبتكما في الإنجاب.',{exact:true}).waitFor();
 const sourcePhoto=await weekly.locator('.df-portrait-image').evaluate(async image=>{await image.decode();return image.currentSrc;});
 for(const [index,tier] of ['premium','seriousness'].entries()){
   const recommendation=page.locator('.df-recommendation').nth(index);
   const seal=recommendation.locator('.df-member-heading .wd-member-badge[data-tier="'+tier+'"]');
   const photo=await recommendation.locator('.df-portrait-media').boundingBox();
   const mark=await seal.boundingBox();
   assert.ok(photo && mark && mark.y>=photo.y+photo.height,'the membership seal sits fully outside the photograph');
 }
 assert.equal(await weekly.locator('.df-portrait-placeholder, .df-portrait-media .cm-avatar').count(),0,'a loaded portrait has no monogram layer to surface during navigation');
 await page.screenshot({path:resolve(output,'recommended-390.png'),fullPage:true});
 await weekly.getByRole('button',{name:'عرض ملف سارة'}).click({position:{x:20,y:20}});
 await page.locator('.mp-profile h1').waitFor();
 const profile=page.locator('.mp-profile');
 assert.equal(await profile.locator('.mp-portrait img').first().evaluate(async image=>{await image.decode();return image.currentSrc;}),sourcePhoto);
 assert.equal(await page.locator('html').getAttribute('data-capture-scope'),null);
 await profile.getByLabel('خيارات الملف').click();
 const block=await profile.getByRole('button',{name:'حظر العضو',exact:true}).boundingBox();
 const report=await profile.getByRole('button',{name:'الإبلاغ والحظر',exact:true}).boundingBox();
 assert.ok(block && report && report.y>=block.y+block.height,'profile menu actions occupy separate rows');
 await profile.getByLabel('خيارات الملف').click();
 assert.equal(await profile.getByText('أقدّر الوضوح والحوار وأبحث عن شراكة هادئة.',{exact:true}).count(),1);
 assert.equal(await profile.locator('.mp-fit-preview, .mp-content .nf-fit-score').count(),0);
 await page.screenshot({path:resolve(output,'profile-390.png'),fullPage:true});
 await profile.getByRole('button',{name:'التوافق',exact:true}).click();
 assert(await profile.locator('[data-fit-score="preferences"]').getByRole('img',{name:'٧٢ بالمئة',exact:true}).isVisible());
 await page.locator('.mp-back').click();
 await weekly.waitFor();
 await weekly.getByRole('button',{name:/توافق التفضيلات مع سارة/}).click();
 const sheet=page.getByRole('dialog');await sheet.getByRole('heading',{name:'التوافق بينكما'}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'جميع الملفات',exact:true}).click();
 await page.locator('.dr-person-row').first().waitFor();await page.evaluate(()=>document.fonts.ready);
 const first=page.getByRole('article',{name:'ملف سارة',exact:true});
 const ineligible=page.getByRole('article',{name:'ملف نورة',exact:true});
 for(const [name,tier] of [['سارة','premium'],['ريم','seriousness']]){
   const avatar=page.getByRole('article',{name:'ملف '+name,exact:true}).locator('.dr-row-avatar');
   const seal=avatar.locator(':scope > .wd-member-badge[data-tier="'+tier+'"]');
   await seal.waitFor();
   assert.equal(await avatar.locator('.dr-row-image .wd-member-badge').count(),0);
 }
 const rowFrame=async name=>page.getByRole('article',{name:'ملف '+name,exact:true}).locator('.dr-row-image').evaluate(node=>{
   const frame=getComputedStyle(node);
   return [node.offsetWidth,node.offsetHeight,frame.borderTopWidth,frame.borderRadius,frame.boxShadow];
 });
 await page.getByRole('article',{name:'ملف مها',exact:true}).locator('.dr-row-image b').waitFor();
 assert.deepEqual(await rowFrame('سارة'),await rowFrame('مها'),'photos and initials share the same portrait frame');
 await page.screenshot({path:resolve(output,'directory-390.png')});
 const concern = 'تختلف رغبتكما الشخصية في الإنجاب.';
 assert.equal(await first.getByText(concern,{exact:true}).count(),0,'decision explanations stay out of the compact directory');
 await first.locator('.dr-bio-peek').click();
 assert.equal(await profile.getByText(concern,{exact:true}).count(),0,'compatibility explanations stay out of the profile overview');
 await profile.getByRole('button',{name:'التوافق',exact:true}).click();
 await profile.locator('.mp-fit-preferences > summary').click();
 await profile.getByText(concern,{exact:true}).waitFor();
 await page.locator('.mp-back').click();
 assert.equal(await ineligible.locator('.dr-row-interest').count(),0);

 await ineligible.getByRole('button',{name:'غير مؤهل للتعارف'}).click();
 await page.getByText('هذا الملف غير مؤهل لطلب تعارف وفق الشروط الحالية.').waitFor();
 assert.equal(await page.locator('.mp-action-main').count(),0);
 await page.locator('.mp-back').click();
 await page.getByRole('button',{name:'تصفية الملفات',exact:true}).click();
 const eligibility=page.getByRole('switch',{name:'المؤهلون للتعارف فقط'});
 assert.equal(await eligibility.isChecked(),false);
 await page.getByText('المؤهلون للتعارف فقط',{exact:true}).click();
 assert.equal(await eligibility.isChecked(),true);
 await page.getByRole('button',{name:'عرض النتائج',exact:true}).click();
 await ineligible.waitFor({state:'detached'});
 await page.getByRole('button',{name:'إزالة المؤهلون للتعارف فقط'}).click();
 await ineligible.waitFor();

 await first.getByRole('button',{name:/التوافق مع سارة/}).click();
 await sheet.getByRole('heading',{name:'التوافق بينكما'}).waitFor();
 await page.keyboard.press('Escape');
 await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة'}).click();await first.getByRole('button',{name:'إلغاء الاهتمام بـ سارة',pressed:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.__interest),[{id:'p0',value:true}]);
 assert.equal(await page.getByText('أُرسل إشعار باهتمامك.',{exact:true}).count(),1);
 assert.equal(await page.getByText('متابعة طلبي',{exact:true}).count(),0);
 await first.getByRole('button',{name:'إلغاء الاهتمام بـ سارة'}).click();await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة',pressed:false}).waitFor();
 await page.evaluate(()=>window.__failInterest=true);await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة'}).click();await page.getByRole('alert').waitFor();
 assert.equal(await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة'}).getAttribute('aria-pressed'),'false');
 await page.evaluate(()=>window.__failInterest=false);
 await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة',exact:true,pressed:false}).click();
 const selectedInterest=first.getByRole('button',{name:'إلغاء الاهتمام بـ سارة',exact:true,pressed:true});
 await selectedInterest.waitFor();
 assert.equal(await selectedInterest.locator('svg').getAttribute('fill'),'currentColor');
 for(const width of [320,375,393,430,768]){
   await page.setViewportSize({width,height:844});await page.screenshot({path:resolve(output,'rows-'+width+'.png'),fullPage:true});
   assert(await page.evaluate(width=>document.documentElement.scrollWidth<=width+1,width),'rows should not overflow at '+width);
   assert(await first.locator('.dr-row-name strong').evaluate(n=>n.clientWidth>0&&n.clientWidth>=n.scrollWidth),'member name should fit alongside the percentage at '+width);
   if (width >= 375 && width <= 430) {
     assert.ok((await first.boundingBox()).height <= 90, 'standard profile retains the compact directory height at '+width);
   }
   const overlapsVertically = (a,b) => a.y < b.y + b.height && b.y < a.y + a.height;
   const [name, age, interest, score, bio, request] = await Promise.all([
     first.locator('.dr-row-name strong'), first.locator('.dr-row-name').getByText(/^(?:٢٨|28)$/),
     first.locator('.dr-row-interest'), first.locator('.dr-fit-visual'), first.locator('.dr-bio-peek'),
     first.locator('.dr-row-request'),
   ].map(locator => locator.boundingBox()));
   assert.ok(name && age && interest && score && bio && request,'all row elements visible at '+width);
   assert.ok(overlapsVertically(name,age) && overlapsVertically(name,interest) && overlapsVertically(name,score)
     && age.x+age.width <= name.x+1 && interest.x+interest.width <= age.x+1 && score.x+score.width <= interest.x+1,
     'RTL title geometry at '+width+': '+JSON.stringify({name,age,interest,score}));
   assert.ok(overlapsVertically(bio,request) && request.x+request.width <= bio.x+1 && request.y >= name.y+name.height-1,
     'bio and request share the RTL footer at '+width);
   assert.ok(await first.locator('.dr-bio-peek').evaluate(button => {
     const text = document.createRange();
     text.selectNodeContents(button);
     const lines = Array.from(text.getClientRects(), rect => rect.y);
     return lines.length>0 && Math.max(...lines)-Math.min(...lines)<1 && button.clientWidth>0;
   }), 'bio preview occupies exactly one line at '+width);
   await first.scrollIntoViewIfNeeded();
   const hitTargets = await first.evaluate(row => {
     const targetAt = (element, horizontal = .5, vertical = .5) => {
       const {x,y,width,height} = element.getBoundingClientRect();
       return document.elementFromPoint(x+width*horizontal,y+height*vertical)?.closest('button');
     };
     const heart = row.querySelector('.dr-row-interest');
     const profileButton = row.querySelector('.dr-row-profile');
     const profileLabels = [...row.querySelectorAll('.dr-row-name strong,.dr-row-name > span,.dr-row-context > span')];
     return {
       interest: [.08,.5,.92].every(vertical => targetAt(heart,.5,vertical) === heart),
       profile: profileLabels.filter(label => label.textContent?.trim()).every(label =>
         [.1,.5,.9].every(vertical => targetAt(label,.5,vertical) === profileButton)),
       controls: ['.dr-fit-visual','.dr-bio-peek','.dr-row-request'].every(selector => {
         const button = row.querySelector(selector);
         return [1 / button.offsetHeight, .5, 1 - 1 / button.offsetHeight].every(vertical => targetAt(button,.5,vertical) === button);
       }),
     };
   });
   assert.deepEqual(hitTargets,{interest:true,profile:true,controls:true},'visible labels and controls resolve to their intended tap targets at '+width);
   assert.equal(await scoreText(first),percent(72));
   assert(await first.locator('.dr-fit-visual').evaluate(n=>n.getBoundingClientRect().height>=44),'percentage opens an accessible target at '+width);
 }
 assert.equal(await page.locator('.dr-online-label').count(),2);assert.equal(await page.locator('.dr-avatar-online').count(),2);
 const wave = first.locator('.nf-logo-wave').first();
 const badge = first.locator('.nf-score-tile');
 await badge.scrollIntoViewIfNeeded();
 await badge.locator('xpath=self::*[not(@data-wave-offscreen)]').waitFor();
 await badge.evaluate(element => {
   const spacer = document.createElement('div');
   spacer.id = 'wave-scroll-spacer';
   spacer.style.height = '100vh';
   document.body.append(spacer);
   window.scrollBy(0, element.getBoundingClientRect().bottom + 24);
 });
 await badge.locator('xpath=self::*[@data-wave-offscreen]').waitFor();
 const pausedAt = await wave.evaluate(async element => {
   const [animation] = element.getAnimations();
   await animation.ready;
   const time = animation.currentTime;
   await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
   if (animation.currentTime !== time) throw Error('Offscreen score animation advanced');
   return time;
 });
 await badge.scrollIntoViewIfNeeded();
 await badge.locator('xpath=self::*[not(@data-wave-offscreen)]').waitFor();
 assert.ok(await wave.evaluate(async element => {
   const [animation] = element.getAnimations();
   await animation.ready;
   return animation.currentTime;
 }) >= pausedAt, 'visible score wave resumes from its paused phase');
 await page.locator('#wave-scroll-spacer').evaluate(element => element.remove());
 const partialRow=page.getByRole('article',{name:'ملف ريم',exact:true});
 await partialRow.getByRole('button',{name:/٧ من ١٦ مواضيع قابلة للمقارنة/}).click();
 await page.getByRole('dialog').getByText(/يمكن مقارنة ٧ من ١٦/).waitFor();
 await page.keyboard.press('Escape');
 const sample=page.getByRole('article',{name:'ملف مها',exact:true});assert.equal(await sample.locator('.dr-row-actions').count(),0);await sample.locator('.dr-row-image b').waitFor();assert.equal(await sample.getByRole('button',{name:/استعراض الملف الخيالي/}).count(),1);
 await sample.locator('.dr-sample-preview').click();await page.getByText('طلبات التعارف غير متاحة لهذا الملف.',{exact:true}).waitFor();assert.equal(await page.locator('.mp-action-main').count(),0);await page.locator('.mp-back').click();await first.locator('.dr-bio-peek').click();await page.locator('.mp-profile h1').waitFor();await page.locator('.mp-back').click();
 await page.getByRole('button',{name:'فتح البحث',exact:true}).click();await page.getByRole('textbox',{name:'البحث بالاسم أو المهنة أو النبذة'}).fill('سارة');await page.waitForTimeout(400);await page.getByRole('button',{name:'تصفية الملفات',exact:true}).click();await page.getByLabel('من', {exact:true}).fill('25');await page.getByRole('button',{name:'عرض النتائج',exact:true}).click();await page.getByRole('button',{name:/مسح .* فلاتر/}).click();await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.__filters.at(-1).search),'سارة');
 await page.getByRole('textbox',{name:'البحث بالاسم أو المهنة أو النبذة'}).fill('لا يوجد');await page.getByRole('button',{name:'مسح البحث والتصفية',exact:true}).click();await first.waitFor();
 await page.emulateMedia({reducedMotion:'reduce'});assert(await first.evaluate(n=>parseFloat(getComputedStyle(n).transitionDuration)<.001));
 assert(await page.locator('.dr-filter-shortcut').evaluate(n=>n.getBoundingClientRect().height>=44));assert(await first.locator('.dr-row-request').evaluate(n=>n.getBoundingClientRect().height>=44));
 assert.equal(await scoreText(first),percent(72));
 assert.equal(await scoreText(page.getByRole('article',{name:'ملف نورة',exact:true})),percent(0));
 assert.equal(await page.getByRole('article',{name:'ملف ريم',exact:true}).locator('.nf-score-tile').count(),0);
 assert.equal(await page.getByRole('article',{name:'ملف لولو',exact:true}).locator('.nf-score-tile').count(),0);
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://127.0.0.1:5281/__discovery-fixture?free');
 assert.equal(await scoreText(weekly),percent(65));assert.equal(await page.locator('.df-recommendation .nf-score-tile').count(),1);
 assert.doesNotMatch(await weekly.ariaSnapshot(),/تختلف رغبتكما|٧٢٪|72%/);
 const selected=plan=>page.locator('.wd-plan-choice').getByRole('button',{name:plan,pressed:true});
 const back=page.getByRole('button',{name:'رجوع',exact:true});
 await weekly.locator('.wd-weekly-upgrade').tap();
 await selected(/المميزة/).waitFor();
 await page.locator('.wd-plan-portrait img').evaluate(img=>img.decode());
 await page.screenshot({path:resolve(output,'paywall-premium-390.png')});
 assert.match(await page.locator('.wd-current-membership').innerText(),/المجانية/);
 const seriousnessButton=page.locator('.wd-plan-choice').getByRole('button',{name:/وسام الجدية/});
 await seriousnessButton.focus();await page.keyboard.press('Enter');await selected(/وسام الجدية/).waitFor();
 assert.equal(await page.locator('.wd-plan-portrait').evaluate(n=>getComputedStyle(n).animationName),'none');
 await page.locator('.wd-plan-portrait img').evaluate(img=>img.decode());
 await page.screenshot({path:resolve(output,'paywall-seriousness-390.png')});
 await page.setViewportSize({width:320,height:640});
 const summary=page.locator('.wd-comparison-detail>summary');await summary.focus();await page.keyboard.press('Space');
 await page.getByRole('table',{name:/مقارنة العضوية/}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=320),'comparison fits a narrow iPhone');
 assert.equal(await page.locator('.wd-tier-comparison').getAttribute('data-plan'),'seriousness');
 await page.locator('.wd-plan-choice').getByRole('button',{name:/المميزة/}).click();await selected(/المميزة/).waitFor();
 assert.equal(await page.locator('.wd-tier-comparison').getAttribute('data-plan'),'premium');
 assert.equal(await page.locator('.wd-tier-change').count(),0,'previewing never changes membership');
 await back.click();await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'جميع الملفات',exact:true}).click();
 const directoryLock=first.getByRole('button',{name:'اشترك لعرض نسبة التوافق'});
 await directoryLock.waitFor();assert.equal(await first.locator('.nf-score-tile').count(),0);
 assert.doesNotMatch(await first.ariaSnapshot(),/تختلف رغبتكما|٧٢٪|72%|٦٥٪|65%/);
 const upgradeRequest=first.locator('.dr-row-request');
 await upgradeRequest.scrollIntoViewIfNeeded();
 assert.ok(await upgradeRequest.evaluate(button => {
   const rect=button.getBoundingClientRect();
   return document.elementFromPoint(rect.right-5,rect.top+2)?.closest('button')===button;
 }), 'the top edge of the free upgrade action opens membership');
 await directoryLock.tap();await selected(/المميزة/).waitFor();await back.click();
 await openProfileAtMembershipSeal(first);
 assert.doesNotMatch(await page.locator('.mp-profile').ariaSnapshot(),/تختلف رغبتكما|٧٢٪|72%|٦٥٪|65%/);
 await page.getByRole('button',{name:'فتح تفاصيل التوافق مع العضوية المميزة'}).press('Enter');
 await selected(/المميزة/).waitFor();await back.click();
 await page.getByRole('button',{name:'ابحث مع لونا'}).click();
 await page.getByRole('button',{name:'اكتشف وسام الجدية'}).click();await selected(/وسام الجدية/).waitFor();await back.click();
 for(const [tier,label] of [['premium','تفعّلت عضويتك المميزة'],['seriousness','تفعّل وسام الجدية'],['premium','عضويتك الآن المميزة'],['free','عضويتك الآن مجانية']]){
  const initialReads=await page.evaluate(()=>window.__filters.length);
  await page.evaluate(value=>window.__setTier(value),tier);
  await page.getByRole('status').filter({hasText:label}).waitFor();
  if(label==='تفعّلت عضويتك المميزة'||tier==='free'){
   await page.waitForFunction(count=>window.__filters.length>count,initialReads);
  }
  await page.getByRole('button',{name:'إغلاق إشعار العضوية'}).click();
  assert.equal(await page.locator('.wd-tier-change').count(),0);
 }
 await page.goto('http://127.0.0.1:5281/__discovery-fixture?settings');await page.getByRole('heading',{name:'الإعدادات',exact:true}).waitFor();await page.waitForTimeout(250);assert.equal(await page.locator('.st-verification-entry').count(),0);
 await page.goto('http://127.0.0.1:5281/__discovery-fixture?settings&legacy');
 await page.locator('.st-hub > summary').filter({hasText:'رحلتي وأدوات الزواج'}).click();
 await page.getByRole('button',{name:/طلبات التوثيق السابقة/}).waitFor();
 // Simulate the Capacitor contract. The screenshot records the actual HTML
 // backing a secure canvas, not the result of the iOS hardware compositor.
 await page.goto('http://127.0.0.1:5281/__discovery-fixture?protectedPhotos');
 await page.locator('.df-recommendation .nf-avatar-render[data-ready]').waitFor();
 assert.equal(await page.locator('.wd-private-portrait').count(),0,'ordinary browsers use the existing visual portraits');
 await page.addInitScript(() => {
   window.CapacitorCustomPlatform={name:'ios'};
   window.__portraits=new Map();
   window.__placedImages=new Set();
   window.__uncoveredSealTiers=new Set();
   window.__scopeReady=new Promise(resolve=>{window.__enterDiscovery=resolve;});
   window.__canPlace=false;
   window.__firstPlacement=new Promise(resolve=>{window.__releasePortraits=resolve;});
   window.Capacitor={
     PluginHeaders:[{name:'PrivateSession',methods:['read','setCaptureScope','discoveryPortrait'].map(name=>({name,rtype:'promise'}))}],
     nativePromise:async(_plugin,method,options)=>{
       if(method==='read') return {token:null};
       if(method==='setCaptureScope') {
         if(options.scope==='discovery')await window.__scopeReady;
         window.__scope=options;return;
       }
       if(!options.box){window.__portraits.delete(options.id);return {placed:false};}
       if(!window.__portraits.has(options.id)&&!options.image)return {placed:false};
       await window.__firstPlacement;
       if(!window.__canPlace)return {placed:false};
       // The scroll position sampled by JS travels with its rectangle. UIKit
       // may receive the call after a different scroll position is onscreen.
       const [x,y,width,height]=options.box;
       const [originX,originY]=options.scrollOrigin;
       window.__portraits.set(options.id,[x+originX,y+originY,width,height]);
       if(options.image){
         const [x,y,w,h]=options.box;
         const target=[...document.querySelectorAll('.wd-private-portrait')].find(node=>{
           const rect=node.getBoundingClientRect();
           return Math.abs(rect.x+scrollX-x-originX)<2 && Math.abs(rect.y+scrollY-y-originY)<2 && Math.abs(rect.width-w)<2;
         });
         if(target)window.__placedImages.add((w<60?'row ':'card ')+target.getAttribute('aria-label'));
         const seal=target?.closest('.dr-row-avatar')?.querySelector(':scope > .wd-member-badge');
         if(seal){
           const bounds=seal.getBoundingClientRect();
           const expected=[bounds.x+scrollX-originX,bounds.y+scrollY-originY,bounds.width,bounds.height];
           if(options.cutouts?.some(rect=>expected.every((value,i)=>Math.abs(value-rect[i])<1)))window.__uncoveredSealTiers.add(seal.dataset.tier);
         }
       }
       if(options.box[2]<60 && (options.cutouts||[]).some(rect=>rect[2]>=options.box[2] && rect[3]>=options.box[3])) window.__obscuredAvatar=true;
       return {placed:true};
     }
   };
 });
 await page.goto('http://127.0.0.1:5281/__discovery-fixture?protectedPhotos');
 const firstBacking=page.locator('.df-recommendation .wd-private-portrait').first();
 await firstBacking.waitFor();
 await page.locator('html[data-portrait-pending]').waitFor({state:'attached'});
 assert.equal(await page.locator('.wd-capture-note').isVisible(),false,'entering discovery should leave recommendations visible');
 assert.equal(await page.evaluate(()=>window.__portraits.size),0);
 assert.equal(await firstBacking.evaluate(node=>getComputedStyle(node).backgroundImage),'none','cold loads should not flash the screenshot lock');
 await page.evaluate(()=>window.__enterDiscovery());
 await page.evaluate(()=>window.__releasePortraits());
 await page.locator('.df-recommendation .wd-private-portrait[data-portrait-state=unavailable]').first().waitFor();
 await page.evaluate(()=>{window.__canPlace=true;window.dispatchEvent(new Event('wudayn:privacy-visible'));});
 for (const [width,height] of [[375,812],[393,852],[430,932]]) {
   await page.setViewportSize({width,height});
   const card=page.locator('.df-recommendation').first();
   await card.locator('.wd-private-portrait').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>window.__scope?.portraitOnly && window.__portraits.size>0);
   assert.equal(await card.locator('.df-card-portrait img[src*="portraits"]').count(),0);
   assert.equal(await card.locator('.df-live-caption,.wd-capture-watermark').count(),0);
   assert.equal(await page.locator('.wd-capture-trigger:visible').count(),0);
   assert.equal(await card.locator('.df-card-portrait').evaluate(node=>getComputedStyle(node).backgroundImage),'none');
   const art = await card.locator('.wd-private-portrait[data-portrait-state=ready]').evaluate(async node=>{
     const style=getComputedStyle(node);
     const url=style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
     const img=new Image(); img.src=url; await img.decode();
     return {width:img.naturalWidth,height:img.naturalHeight,positionY:parseFloat(style.backgroundPositionY)/100};
   });
   assert.ok(art.width>=390,'the capture backing must render the bundled privacy artwork');
   const [photoBox,identityBox,headerBox]=await Promise.all([card.locator('.wd-private-portrait'),card.locator('.df-portrait-identity'),card.locator('.df-card-portrait')].map(el=>el.boundingBox()));
   const mediaBox=await card.locator('.df-portrait-media').boundingBox();
   for(const edge of ['x','y','width','height']) assert.ok(Math.abs(photoBox[edge]-mediaBox[edge])<1,'the protected portrait must match its reserved photo slot');
   assert.ok(Math.abs(photoBox.x+photoBox.width/2-headerBox.x-headerBox.width/2)<1,'privacy artwork must be centered');
   assert.ok(photoBox.y+photoBox.height<=identityBox.y+1,'portrait must leave the name and metadata readable');
   const sealBox=await card.locator('.df-member-heading .wd-member-badge').boundingBox();
   assert.ok(sealBox && sealBox.y>=photoBox.y+photoBox.height,'the membership seal needs no cutout in the native portrait');
   // The woven lock spans 4% to 65% of the bundled square, from shackle to base.
   const scaledHeight=art.height*Math.max(photoBox.width/art.width,photoBox.height/art.height);
   const offsetY=(photoBox.height-scaledHeight)*art.positionY;
   const topGap=offsetY+.04*scaledHeight;
   const bottomGap=photoBox.height-(offsetY+.65*scaledHeight);
   assert.ok(topGap>0 && bottomGap>0 && Math.abs(topGap-bottomGap)<photoBox.height*.02,
     'the full lock must have equal breathing room above and below it at '+width);
   assert.ok(await card.evaluate(node=>{
     const header=getComputedStyle(node.querySelector('.df-card-portrait')).backgroundColor;
     return header==='rgba(0, 0, 0, 0)' || header===getComputedStyle(node).backgroundColor;
   }),'member details must sit on the card surface without a dark strip');
   await page.waitForFunction(([x,y,w,h])=>[...window.__portraits.values()].some(rect=>
     [x+scrollX,y+scrollY,w,h].every((value,i)=>Math.abs(value-rect[i])<1)),[photoBox.x,photoBox.y,photoBox.width,photoBox.height]);
   await card.screenshot({path:resolve(output,'iphone-capture-card-'+width+'.png')});
 }
 async function verifyProtectedSources(kind,container){
   for(const name of ['سارة','ريم','لولو بنت عبدالرحمن العبدالله']){
     const label='الصورة الشخصية لـ '+name;
     const portrait=page.locator(container).getByRole('img',{name:label,exact:true});
     await portrait.scrollIntoViewIfNeeded();
     await page.waitForFunction(key=>window.__placedImages.has(key),kind+' '+label);
     if(kind==='card') assert.ok(await portrait.evaluate(node=>{
       const card=node.closest('.df-recommendation'), bottom=node.getBoundingClientRect().bottom;
       return ['.df-identity-line h2','.df-card-copy'].every(selector=>card.querySelector(selector).getBoundingClientRect().top>=bottom-1);
     }),'the name and content must sit below each native image');
   }
   assert.equal(await page.locator(container+' :is(img[src*="/portraits/"],.nf-avatar-portrait)').count(),0);
 }
 await verifyProtectedSources('card','.df-portrait-media');
 await page.getByRole('button',{name:'جميع الملفات'}).click();
 await verifyProtectedSources('row','.dr-row-image');
 assert.deepEqual(await page.evaluate(()=>[...window.__uncoveredSealTiers].sort()),['premium','seriousness'],'native portraits leave both tier seals uncovered');
 await checkDirectoryPull();
 const row=page.locator('.dr-person-row').filter({has:page.getByRole('button',{name:/عرض ملف سارة/})}).first();
 await row.scrollIntoViewIfNeeded();
 await row.locator('.wd-private-portrait--small').waitFor();
 await page.waitForFunction(()=>[...window.__portraits.values()].some(box=>box[2]<60));
 assert.equal(await page.evaluate(()=>Boolean(window.__obscuredAvatar)),false,'the online ring must leave its photo visible');
 assert.equal(await page.locator('.dr-person-row img[src*="portraits"]').count(),0);
 await row.screenshot({path:resolve(output,'iphone-capture-directory.png')});
 const activity=await row.locator('.wd-private-portrait--small').evaluate(async portrait=>{
   const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
   const spacer=document.createElement('div');
   spacer.style.height='100vh';
   document.body.append(spacer);
   const initialY=window.scrollY;
   const readRect=portrait.getBoundingClientRect.bind(portrait);
   const setPortrait=window.__portraits.set.bind(window.__portraits);
   try {
     portrait.scrollIntoView({block:'center',behavior:'instant'});
     await new Promise(resolve=>setTimeout(resolve,750));
     const rect=readRect();
     const entry=[...window.__portraits].find(([,box])=>Math.abs(box[0]-rect.x-scrollX)<1 && Math.abs(box[1]-rect.y-scrollY)<1);
     if(!entry)throw Error('the tested row must have an installed native portrait');
     let measurements=0,placements=0;
     portrait.getBoundingClientRect=()=>{measurements++;return readRect();};
     window.__portraits.set=(id,box)=>{if(id===entry[0])placements++;return setPortrait(id,box);};
     // A decorative animation elsewhere used to start 650 ms of layout polling.
     spacer.dispatchEvent(new AnimationEvent('animationstart',{bubbles:true}));
     for(let i=0;i<10;i++)await nextFrame();
     const idleMeasurements=measurements;
     const start=window.scrollY;
     window.scrollTo({top:start+6,behavior:'instant'});
     for(let i=0;i<5;i++)await nextFrame();
     return {idleMeasurements,placements,scrollDistance:window.scrollY-start};
   } finally {
     delete portrait.getBoundingClientRect;
     delete window.__portraits.set;
     spacer.remove();
     window.scrollTo({top:initialY,behavior:'instant'});
   }
 });
 assert.ok(activity.idleMeasurements<=2,'a decorative animation must leave the portrait tracker idle');
 assert.equal(activity.scrollDistance,6,'the fixture must exercise document scrolling');
 assert.equal(activity.placements,0,'the native scroll view already moves this unobstructed portrait');
 await page.getByRole('button',{name:'تصفية الملفات'}).click();
 await page.waitForFunction(()=>window.__portraits.size===0);
 await page.getByRole('button',{name:'إغلاق',exact:true}).click();
 await row.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>window.__portraits.size>0);
 await openProfileAtMembershipSeal(row);
 await page.waitForFunction(()=>window.__scope?.scope==='profile' && !window.__scope.portraitOnly && window.__portraits.size===0);
 assert.equal(await page.locator('.mp-profile .wd-capture-trigger,.mp-profile .wd-capture-watermark').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: discovery layout, membership, interest, iPhone portrait bridge, capture backing and scope cleanup.');
}catch(e){console.error('Browser errors:',errors,e);await page?.screenshot({path:resolve(output,'failure.png'),timeout:5000}).catch(()=>{});throw e;}finally{await browser?.close();await server.close();}
