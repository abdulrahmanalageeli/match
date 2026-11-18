import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/timgo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const root=path.resolve('circle-dealbreakers/public');
const slides=JSON.parse(await readFile(path.join(root,'slides.json'),'utf8'));
const participants=['عبدالرحمن','سارة','خالد','نورة','محمد','ريم','عبدالله','هند','فيصل','لمى','عمر','ليان','أحمد','دانا','ياسر','منى','فهد','شهد','تركي','جود','مشعل','لينا','راكان','نوف'].map((name,i)=>({id:`person-${i}`,name,active:true}));
let event={title:'THE CIRCLE',subtitle:'الحدود والديل بريكرز',date:'2026-10-07',currentSlide:'triage-1',votingOpen:true,revealed:true,endsAt:new Date(Date.now()+180000).toISOString()};
let votes=participants.map((p,i)=>({participantId:p.id,slideId:event.currentSlide,choice:i%4+1}));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1600,height:900}});
await context.route('https://circle.test/**',async route=>{
 const url=new URL(route.request().url());
 if(url.pathname.startsWith('/api/')){
  const body=route.request().postDataJSON();
  if(body.action==='hostSlide'){event={...event,currentSlide:body.slideId,endsAt:new Date(Date.now()+180000).toISOString()};}
  if(body.action==='hostControl'){event={...event,...body};}
  const data={event,slide:slides.find(s=>s.id===event.currentSlide),slides,participants,votes,anonymous:['اختلاف طريقة التعامل وقت الخلاف.','عدم الرغبة في الإنجاب.','تختلف أولوياتنا في الشغل والحياة.','التدخل في كل تفاصيل اليوم.','ما نتفق على طريقة تربية الأطفال.','القرارات الكبيرة تكون من طرف واحد.'].map((text,i)=>({id:`a-${i}`,text}))};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 }
 let relative=url.pathname.replace(/^\/circle\//,'')||'index.html';
 const ext=path.extname(relative);const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.woff2':'font/woff2'};
 try{return route.fulfill({status:200,contentType:types[ext]||'application/octet-stream',body:await readFile(path.join(root,relative))});}catch{return route.fulfill({status:404,body:'Not found'});}
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('https://circle.test/circle/presenter.html');await page.waitForSelector('.name-chip');await page.evaluate(()=>document.fonts.ready);
assert.equal(await page.locator('.name-chip').count(),24);
assert.equal(await page.locator('.choice').count(),4);
await page.screenshot({path:'circle-dealbreakers/presenter-preview.png'});
assert(await page.locator('.name-chip').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=25));
await page.waitForTimeout(650); console.log(await page.locator('.names').evaluateAll(elements=>elements.map(el=>({scroll:el.scrollHeight,height:el.clientHeight,child:el.firstChild.getBoundingClientRect().height,font:getComputedStyle(el.firstChild).fontSize})))); assert(await page.locator('.names').evaluateAll(elements=>elements.every(el=>el.scrollHeight<=el.clientHeight+1)));
await page.locator('#anonymous-toggle').click();await page.locator('#anonymous-dialog').waitFor({state:'visible'});assert.equal(await page.locator('.anonymous-card').count(),4);
await page.screenshot({path:'circle-dealbreakers/anonymous-gallery-preview.png'});
const activeSlide=event.currentSlide;await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.anonymous-card').count(),2);assert.equal(event.currentSlide,activeSlide);
await page.keyboard.press('Escape');assert.equal(await page.locator('#anonymous-dialog').isVisible(),false);
votes[0].choice=4;await page.waitForTimeout(1700);assert.equal(await page.locator('.choice').nth(3).locator('.name-chip').count(),7);
await page.keyboard.press('ArrowRight');await page.waitForTimeout(200);assert.equal(await page.locator('#original-slide').isVisible(),true);
await page.goto('https://circle.test/circle/host.html');await page.waitForSelector('.participant');assert.equal(await page.locator('.participant').count(),24);
await page.screenshot({path:'circle-dealbreakers/host-preview.png',fullPage:true});
assert.deepEqual(errors,[]);
await browser.close();console.log('Presenter: 24 large names without overflow, anonymous gallery pagination and return, animated choice move, navigation, host roster; no browser errors.');

