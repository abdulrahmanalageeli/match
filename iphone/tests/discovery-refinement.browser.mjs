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
import {Settings} from '/src/settings/Settings.tsx';
import {MembershipAccess} from '/src/membership/access.tsx';
import {Membership} from '/src/membership/Membership.tsx';
import {MembershipChangeNotice} from '/src/membership/MembershipEntry.tsx';
import '/src/design.css';import '/src/flows.css';import '/src/screens.css';import '/src/motion.css';
import '/src/community/arrivalDiscovery.css';import '/src/arrivalSurfaces.css';import '/src/typography.css';
const people=['سارة','ريم','لولو','نورة','مها'].map((alias,i)=>({id:'p'+i,alias,age:28+i,city:'الرياض',online:i%2===0,occupation:'مهندسة',bio:'أقدّر الوضوح والحوار وأبحث عن شراكة هادئة.',interests:[],reasons:[],marriageBasics:{marriageTimeline:'within_6_months'},demoPhoto:'/demo/portraits/reem-realistic-v2.webp',fit:{version:'marriage-v4',strengths:[],discussion:[],missing:[],assessmentComplete:true,provisional:false,covered:32,total:32,percentage:72-i*3}}));
people[0].recommendationPercentage=65;people[0].fit.practicalConcerns=['children_intent'];people[1].fit.provisional=true;people[2].compatibilityLocked=true;people[3].fit.percentage=0;people[3].eligible=false;
people[4].isDemo=true;people[4].online=false;people[4].demoPhoto='/demo/portraits/missing.webp';window.__interest=[];window.__failInterest=false;
window.__filters=[];const source={discover:async(f)=>{window.__filters.push(f);return f.search==='لا يوجد'?[]:people.filter(person=>person.eligible!==false||f.mode==='all'&&!f.eligibleOnly);},inbox:async()=>[],watch:()=>()=>{},setInterest:async(id,value)=>{window.__interest.push({id,value});if(window.__failInterest)throw Error('تعذّر إرسال الاهتمام');const index=people.findIndex(p=>p.id===id);people[index]={...people[index],interested:value};},verification:async()=>({claims:[],requests:new URLSearchParams(location.search).has('legacy')?[{id:'old'}]:[]}),request:async()=>{throw Error('not part of fixture')}};
source.blockPerson=async()=>{throw Error('not part of fixture')};
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
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const server=await createServer({root,configFile:resolve(root,'vite.config.ts'),server:{host:'127.0.0.1',port:5281,strictPort:true},
 plugins:[{name:'local-discovery-fixture',enforce:'pre',resolveId(id){if(id==='virtual:discovery-fixture')return '\0discovery-fixture'},
 async load(id){if(id==='\0discovery-fixture')return(await transformWithEsbuild(fixture,'fixture.tsx',{loader:'tsx',jsx:'automatic'})).code;},
 transform(code,id){if(id.replaceAll('\\','/').endsWith('/community/Community.tsx'))return code+'\nexport {Discovery};';},
 configureServer(dev){dev.middlewares.use(async(req,res,next)=>{if(req.url?.startsWith('/__discovery-fixture')){res.setHeader('Content-Type','text/html');res.end(await dev.transformIndexHtml('/__discovery-fixture','<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/__x00__discovery-fixture"></script></body></html>'));return;}next();});}}]});
await server.listen();let browser,page;const errors=[];
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:5281/__discovery-fixture',{waitUntil:'domcontentloaded',timeout:60000});const weekly=page.locator('.df-recommendation').first();
 const percent = value => new Intl.NumberFormat('ar-SA',{style:'percent',numberingSystem:'arab'}).format(value/100).replace(/[\u061c\u200e\u200f]/g,'');
 const scoreText = async tile => (await tile.locator('.nf-score-tile strong').innerText()).replace(/[\u061c\u200e\u200f]/g,'');
 assert.equal(await scoreText(weekly),percent(72));
 await weekly.getByText('تختلف رغبتكما في الإنجاب.',{exact:true}).waitFor();
 await page.screenshot({path:resolve(output,'recommended-390.png'),fullPage:true});
 await weekly.getByRole('button',{name:'عرض ملف سارة'}).click({position:{x:20,y:20}});
 await page.locator('.mp-profile h1').waitFor();
 const profile=page.locator('.mp-profile');
 await profile.getByLabel('خيارات الملف').click();
 const block=await profile.getByRole('button',{name:'حظر العضو',exact:true}).boundingBox();
 const report=await profile.getByRole('button',{name:'الإبلاغ والحظر',exact:true}).boundingBox();
 assert.ok(block && report && report.y>=block.y+block.height,'profile menu actions occupy separate rows');
 await profile.getByLabel('خيارات الملف').click();
 assert.equal(await profile.getByText('أقدّر الوضوح والحوار وأبحث عن شراكة هادئة.',{exact:true}).count(),1);
 assert.match(await page.locator('.mp-fit-preview-scores bdi').first().innerText(),/^(?:72%|٧٢٪)$/);
 await page.screenshot({path:resolve(output,'profile-390.png'),fullPage:true});await page.locator('.mp-back').click();
 await weekly.getByRole('button',{name:/توافق التفضيلات مع سارة/}).click();
 const sheet=page.getByRole('dialog');await sheet.getByRole('heading',{name:'التوافق بينكما'}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'جميع الملفات',exact:true}).click();
 await page.locator('.dr-person-row').first().waitFor();await page.evaluate(()=>document.fonts.ready);
 const first=page.getByRole('article',{name:'ملف سارة',exact:true});
 const ineligible=page.getByRole('article',{name:'ملف نورة',exact:true});
 const concern = 'تختلف رغبتكما في الإنجاب.';
 assert.equal(await first.getByText(concern,{exact:true}).count(),0,'decision explanations stay out of the compact directory');
 await first.locator('.dr-bio-peek').click();
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

 await first.getByRole('button',{name:/توافق التفضيلات مع سارة/}).click();
 await sheet.getByRole('heading',{name:'التوافق بينكما'}).waitFor();
 await page.keyboard.press('Escape');
 await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة'}).click();await first.getByRole('button',{name:'إلغاء الاهتمام بـ سارة',pressed:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.__interest),[{id:'p0',value:true}]);
 assert.equal(await page.getByText('أُرسل إشعار باهتمامك.',{exact:true}).count(),1);
 assert.equal(await page.getByText('متابعة طلبي',{exact:true}).count(),0);
 await first.getByRole('button',{name:'إلغاء الاهتمام بـ سارة'}).click();await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة',pressed:false}).waitFor();
 await page.evaluate(()=>window.__failInterest=true);await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة'}).click();await page.getByRole('alert').waitFor();
 assert.equal(await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة'}).getAttribute('aria-pressed'),'false');
 await page.evaluate(()=>window.__failInterest=false);await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة'}).click();await first.getByRole('button',{name:'إلغاء الاهتمام بـ سارة',pressed:true}).waitFor();assert.equal((await first.locator('.dr-row-interest').innerText()).trim(),'مهتم');
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
 await first.getByRole('button',{name:/عرض ملف سارة/}).click();
 assert.doesNotMatch(await page.locator('.mp-profile').ariaSnapshot(),/تختلف رغبتكما|٧٢٪|72%|٦٥٪|65%/);
 await page.getByRole('button',{name:'فتح تفاصيل التوافق مع العضوية المميزة'}).press('Enter');
 await selected(/المميزة/).waitFor();await back.click();
 await page.getByRole('button',{name:'ابحث مع لونا'}).click();
 await page.getByRole('button',{name:'اكتشف وسام الجدية'}).click();await selected(/وسام الجدية/).waitFor();await back.click();
 for(const [tier,label] of [['premium','تفعّلت عضويتك المميزة'],['seriousness','تفعّل وسام الجدية'],['premium','عضويتك الآن المميزة'],['free','عضويتك الآن مجانية']]){
  await page.evaluate(value=>window.__setTier(value),tier);
  await page.getByRole('status').filter({hasText:label}).waitFor();
  await page.getByRole('button',{name:'إغلاق إشعار العضوية'}).click();
  assert.equal(await page.locator('.wd-tier-change').count(),0);
 }
 await page.goto('http://127.0.0.1:5281/__discovery-fixture?settings');await page.getByRole('heading',{name:'الإعدادات',exact:true}).waitFor();await page.waitForTimeout(250);assert.equal(await page.locator('.st-verification-entry').count(),0);
 await page.goto('http://127.0.0.1:5281/__discovery-fixture?settings&legacy');await page.getByRole('button',{name:/طلبات التوثيق السابقة/}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: phone/tablet layout, online labels, interest send/undo/failure, unused verification hidden, legacy access retained.');
}catch(e){console.error('Browser errors:',errors,e);await page?.screenshot({path:resolve(output,'failure.png'),timeout:5000}).catch(()=>{});throw e;}finally{await browser?.close();await server.close();}
