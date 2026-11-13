// Actual discovery/settings components, synthetic people; no production requests.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const root=process.cwd(), output=resolve(root,'.tmp/discovery-refinement');
await mkdir(output,{recursive:true});
const fixture=`
import React from 'react';import {createRoot} from 'react-dom/client';
import {Discovery} from '/src/community/Community.tsx';
import {Settings} from '/src/settings/Settings.tsx';
import '/src/design.css';import '/src/flows.css';import '/src/screens.css';import '/src/motion.css';
import '/src/community/arrivalDiscovery.css';import '/src/arrivalSurfaces.css';import '/src/typography.css';
const people=['سارة','ريم','لولو','نورة','مها'].map((alias,i)=>({id:'p'+i,alias,age:28+i,city:'الرياض',online:i%2===0,occupation:'مهندسة',bio:'أقدّر الوضوح والحوار وأبحث عن شراكة هادئة.',interests:[],reasons:[],marriageBasics:{marriageTimeline:'within_6_months'},demoPhoto:'/demo/portraits/reem-realistic-v2.webp',fit:{version:'marriage-v2',assessmentComplete:true,provisional:false,covered:32,total:32,percentage:72-i*3}}));
window.__interest=[];window.__failInterest=false;
const source={discover:async()=>people,inbox:async()=>[],watch:()=>()=>{},setInterest:async(id,value)=>{window.__interest.push({id,value});if(window.__failInterest)throw Error('تعذّر إرسال الاهتمام');const index=people.findIndex(p=>p.id===id);people[index]={...people[index],interested:value};},verification:async()=>({claims:[],requests:new URLSearchParams(location.search).has('legacy')?[{id:'old'}]:[]}),request:async()=>{throw Error('not part of fixture')}};
const noop=()=>{};const settings=new URLSearchParams(location.search).has('settings');
createRoot(document.getElementById('root')).render(<div className="phone-app"><main className="app-screen cm-shell" dir="rtl">{settings?<Settings demo state={null} demoMember={{displayName:'عبدالرحمن',city:'الرياض',age:30}} paused={false} busy={false} source={source} onEdit={noop} onMembership={noop} onToggle={noop} onDelete={noop} onExit={noop} onPrivacy={noop}/>:<Discovery source={source} onInbox={noop} onConversation={noop} onAccount={noop}/>}</main></div>);
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
 await page.goto('http://127.0.0.1:5281/__discovery-fixture',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('button',{name:'جميع الملفات',exact:true}).click();
 await page.locator('.dr-person-row').first().waitFor();await page.evaluate(()=>document.fonts.ready);
 const first=page.locator('.dr-person-row').first();
 await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة'}).click();await first.getByRole('button',{name:'إلغاء الاهتمام بـ سارة',pressed:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.__interest),[{id:'p0',value:true}]);
 assert.equal(await page.getByText('أُرسل إشعار باهتمامك.',{exact:true}).count(),1);
 assert.equal(await page.getByText('متابعة طلبي',{exact:true}).count(),0);
 await first.getByRole('button',{name:'إلغاء الاهتمام بـ سارة'}).click();await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة',pressed:false}).waitFor();
 await page.evaluate(()=>window.__failInterest=true);await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة'}).click();await page.getByRole('alert').waitFor();
 assert.equal(await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة'}).getAttribute('aria-pressed'),'false');
 await page.evaluate(()=>window.__failInterest=false);await first.getByRole('button',{name:'إبداء الاهتمام بـ سارة'}).click();await first.getByRole('button',{name:'إلغاء الاهتمام بـ سارة',pressed:true}).waitFor();assert(await first.locator('.dr-row-interest span').isVisible());
 for(const width of [390,320,768]){await page.setViewportSize({width,height:844});await page.screenshot({path:resolve(output,'rows-'+width+'.png'),fullPage:true});assert(await page.evaluate(width=>document.documentElement.scrollWidth<=width+1,width),'rows should not overflow at '+width);}
 assert.equal(await page.locator('.dr-online-label').count(),3);assert.equal(await page.locator('.dr-avatar-online').count(),3);
 const score=await first.locator('.dr-fit-visual').evaluate(n=>({border:getComputedStyle(n).borderTopWidth,flex:getComputedStyle(n.firstElementChild).flexDirection}));assert.deepEqual(score,{border:'1px',flex:'column'});
 await page.goto('http://127.0.0.1:5281/__discovery-fixture?settings');await page.getByRole('heading',{name:'الإعدادات',exact:true}).waitFor();await page.waitForTimeout(250);assert.equal(await page.locator('.st-verification-entry').count(),0);
 await page.goto('http://127.0.0.1:5281/__discovery-fixture?settings&legacy');await page.getByRole('button',{name:/طلبات التوثيق السابقة/}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: phone/tablet layout, online labels, interest send/undo/failure, unused verification hidden, legacy access retained.');
}catch(e){console.error('Browser errors:',errors);await page?.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});throw e;}finally{await browser?.close();await server.close();}
