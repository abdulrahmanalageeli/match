// Local-only welcome review: real components, motion and assets; no member APIs.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE||'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output=resolve(root,'.tmp/welcome-experience');await mkdir(output,{recursive:true});
const fixture=`
import React,{useState,useLayoutEffect} from 'react';import {createRoot} from 'react-dom/client';
import {Welcome} from '/src/Welcome.tsx';import {initializeDevicePreferences} from '/src/settings/preferences.ts';
import '/src/design.css';import '/src/flows.css';import '/src/screens.css';import '/src/motion.css';
import '/src/arrivalSurfaces.css';import '/src/typography.css';
initializeDevicePreferences();window.__actions=[];window.__introSamples=[];
function Fixture(){const[cycle,setCycle]=useState(0);window.__remount=()=>setCycle(v=>v+1);
 useLayoutEffect(()=>{requestAnimationFrame(()=>{const main=document.querySelector('.wd-welcome');window.__introSamples.push({at:performance.now(),opening:main.hasAttribute('data-opening'),overlay:!!document.querySelector('.wd-launch-screen'),inert:main.inert,overflow:getComputedStyle(document.body).overflow,animations:document.getAnimations().filter(a=>a.playState==='running').map(a=>a.animationName)});});},[cycle]);
 return <Welcome key={cycle} onRegister={()=>window.__actions.push('register')} onLogin={()=>window.__actions.push('login')} onPrivacy={()=>window.__actions.push('privacy')}/>;
}
createRoot(document.getElementById('root')).render(<div className="phone-app"><Fixture/></div>);
`;
const server=await createServer({root,configFile:resolve(root,'vite.config.ts'),cacheDir:resolve(root,'node_modules/.vite-welcome-experience'),
 server:{host:'127.0.0.1',port:5286,strictPort:true},
 optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react','@capacitor/core','react-native-reanimated','react-native-worklets'],esbuildOptions:{resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.mjs','.json']}},
 plugins:[{name:'local-welcome-fixture',enforce:'pre',resolveId(id){if(id==='virtual:welcome-experience')return '\0welcome-experience'},
 async load(id){if(id==='\0welcome-experience')return(await transformWithEsbuild(fixture,'fixture.tsx',{loader:'tsx',jsx:'automatic'})).code;},
 configureServer(dev){dev.middlewares.use(async(req,res,next)=>{if(req.url?.startsWith('/__welcome-experience')){res.setHeader('Content-Type','text/html');res.end(await dev.transformIndexHtml('/__welcome-experience','<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/@id/__x00__welcome-experience"></script></body></html>'));return;}next();});}}]});
await server.listen();let browser,page;const errors=[],externalRequests=[],checks=[];
const url='http://127.0.0.1:5286/__welcome-experience';
const recordWelcome=process.env.WUDAYN_RECORD_WELCOME==='1';
const captureStills=process.env.WUDAYN_CAPTURE_STILLS!=='0';
const viewport=recordWelcome ? {width:402,height:874} : {width:390,height:844};
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ar-SA'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1'||u.protocol==='data:')return route.continue();externalRequests.push(u.origin);return route.abort();});
 page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__introSamples.length>0);
 const opening=await page.evaluate(()=>window.__introSamples[0]);assert(opening.opening&&opening.overlay&&opening.inert,'first mount has launch overlay and inert welcome');assert(opening.animations.includes('wd-logo-draw'),'large logo draws on first mount');assert.equal(opening.overflow,'hidden');assert.equal(await page.locator('.wd-launch-screen').evaluate(node=>document.activeElement===node),true,'intro initially focuses its container without highlighting skip');
 const bounds=await page.locator('.wd-launch-screen').evaluate(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight};});
 assert(Math.abs(bounds.x)<1&&Math.abs(bounds.y)<1&&Math.abs(bounds.width-bounds.viewportWidth)<1&&Math.abs(bounds.height-bounds.viewportHeight)<1,'intro fills the viewport: '+JSON.stringify(bounds));
 await page.locator('.nf-join').evaluate(button=>button.focus());assert.equal(await page.locator('.nf-join').evaluate(button=>document.activeElement===button),false,'covered welcome controls cannot receive focus');
 const remaining=await page.evaluate(()=>Math.max(0,700-(performance.now()-window.__introSamples[0].at)));await page.waitForTimeout(remaining);if(captureStills)await page.screenshot({path:resolve(output,'welcome-'+viewport.width+'-launch.png')});assert.equal(await page.locator('.wd-launch-screen button').count(),0,'cinematic intro has no visible action buttons');
 const heroBeforeHandoff=await page.locator('.wd-hero-copy').elementHandle();
 await page.locator('.wd-launch-screen').waitFor({state:'detached',timeout:3000});
 const launchElapsed=await page.evaluate(()=>performance.now()-window.__introSamples[0].at);
 assert.equal(await heroBeforeHandoff.evaluate(node=>node===document.querySelector('.wd-hero-copy')),true,'hero stays mounted through the intro handoff');
 assert(await page.locator('.wd-hero-copy').evaluate(node=>Number(getComputedStyle(node).opacity)>.5),'hero entrance is already in progress when intro ends');
 const pair=page.locator('.wd-welcome-nav .wd-pair-preview');
 const next=pair.getByRole('button',{name:'القصة التالية'});
 const score=pair.locator('.wd-pair-score strong');
 const reading=pair.locator('.wd-pair-reading');
 await pair.waitFor();
 assert.equal(await score.textContent(),'٨٦٪');
 await page.waitForFunction(()=>document.querySelector('.wd-pair-score strong')?.textContent==='٩٢٪');
 assert.match(await reading.innerText(),/مسؤولياتنا المالية/);
 assert(await pair.locator('img').evaluateAll(nodes=>nodes.every(n=>n.complete && n.naturalWidth>0)));
 await pair.getByRole('button',{name:'من كلام فهد'}).click();
 assert.match(await reading.innerText(),/التزاماتنا لأهلنا/);
 assert.equal(await pair.getByRole('button',{name:'تشغيل التبديل التلقائي'}).count(),1);
 await page.waitForTimeout(6950);
 assert.equal(await score.textContent(),'٩٢٪');
 await next.focus();await page.keyboard.press('Enter');
 assert.equal(await score.textContent(),'٧٨٪');
 await next.click();assert.equal(await score.textContent(),'٨٩٪');
 await next.click();assert.equal(await score.textContent(),'٨٦٪');
 if(captureStills)await page.screenshot({path:resolve(output,'welcome-pair-stories.png'),animations:'disabled'});
 assert.equal(await page.getByRole('dialog').count(),0);
 assert(await page.locator('.nf-join,.nf-mast-login').evaluateAll(nodes=>nodes.every(node=>{
  const b=node.getBoundingClientRect();return node.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));
 })));
 checks.push('pairs rotate together with their portraits, overall scores and marriage decisions; reading a portrait pauses, keyboard navigation wraps through all four');
 const settled=await page.evaluate(()=>({inert:document.querySelector('.wd-welcome').inert,overflow:getComputedStyle(document.body).overflow}));
 assert(launchElapsed<3200,'intro finishes promptly: '+launchElapsed);assert.equal(settled.inert,false);assert.notEqual(settled.overflow,'hidden');assert.deepEqual(await page.evaluate(()=>window.__actions),[]);
 checks.push('full-screen logo intro locks background, finishes within three seconds, and restores interaction');
 await page.locator('.nf-join').click();await page.locator('.nf-mast-login').click();await page.getByRole('button',{name:'الخصوصية وشروط الاستخدام',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.__actions),['register','login','privacy']);checks.push('registration, login and privacy callbacks after intro');
 await page.evaluate(()=>window.__remount());await page.waitForFunction(()=>window.__introSamples.length===2);assert.equal(await page.locator('.wd-welcome').getAttribute('data-opening'),null);assert.equal(await page.locator('.wd-launch-screen').count(),0);assert.equal(await score.textContent(),'٨٦٪');checks.push('returning to welcome keeps the inline preview visible without replaying it');
 const controls=page.getByRole('group',{name:'استكشف شاشات التطبيق'}).getByRole('button');assert.equal(await controls.count(),3);
 for(let i=0;i<3;i++){await controls.nth(i).click();assert.equal(await controls.nth(i).getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.wd-preview-controls button[aria-pressed="true"]').count(),1);await page.locator('.wd-device-screen img').scrollIntoViewIfNeeded();await page.waitForFunction(()=>{const image=document.querySelector('.wd-device-screen img');return image.complete&&image.naturalWidth>0;});}
 checks.push('all three preview images load and selection state is accessible');
 await page.getByRole('button',{name:'تعرّف على منهج وُدَين',exact:true}).click();await page.locator('.wd-why-dialog[open]').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.wd-why-dialog[open]').count(),0);checks.push('method dialog opens and closes');
 await controls.nth(0).click();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1800);
 for(const width of recordWelcome ? [viewport.width] : [320,390,1024]){
  await page.setViewportSize({width,height:viewport.height});await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(100);
  const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth,root:document.querySelector('.wd-welcome').getBoundingClientRect().width}));assert(layout.scroll<=width+1&&layout.root<=width+1,JSON.stringify({width,...layout}));
  const small=await page.locator('.wd-welcome button,.wd-welcome a').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<43.9;}).map(n=>({text:n.textContent.trim(),height:n.getBoundingClientRect().height})));assert.deepEqual(small,[],'interactive targets should be at least 44px high');
  if(captureStills&&width===390){await page.screenshot({path:resolve(output,'welcome-390-hero.png')});await page.screenshot({path:resolve(output,'welcome-390-full.png'),fullPage:true});}
  if(captureStills&&width===1024)await page.screenshot({path:resolve(output,'welcome-1024-full.png'),fullPage:true});
 }
 checks.push('tested width fits with touch targets at least 44px high');
 if(!recordWelcome)await page.setViewportSize({width:320,height:568});
 await page.evaluate(()=>window.scrollTo(0,0));
 const joinBounds=await page.locator('.nf-join').boundingBox();
 assert(joinBounds && joinBounds.y>=0 && joinBounds.y+joinBounds.height<=page.viewportSize().height,'sign-up is visible');
 await page.setViewportSize(viewport);
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('.wd-launch-screen').waitFor();await page.locator('.wd-launch-screen').click({position:{x:30,y:300}});await page.locator('.wd-launch-screen').waitFor({state:'detached',timeout:1500});assert.equal(await page.locator('.wd-welcome').evaluate(node=>node.inert),false);assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).overflow),'hidden');checks.push('tapping the button-free intro restores welcome immediately');
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('.wd-launch-screen').waitFor();await page.keyboard.press('Tab');await page.locator('.wd-launch-screen').waitFor({state:'detached',timeout:1500});assert.equal(await page.locator('.nf-join').evaluate(node=>document.activeElement===node),true);checks.push('keyboard Tab skips intro and focuses registration');
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('.wd-launch-screen').waitFor();await page.keyboard.press('Escape');await page.locator('.wd-launch-screen').waitFor({state:'detached',timeout:1500});assert.equal(await page.locator('.wd-welcome').evaluate(node=>node.inert),false);checks.push('Escape dismisses intro and releases background');
 async function checkStaticPreview(){
  await page.reload({waitUntil:'domcontentloaded'});
  await pair.waitFor();
  assert.equal(await page.locator('.wd-launch-screen').count(),0);
  assert.equal(await pair.getByRole('button',{name:'إيقاف التبديل التلقائي'}).count(),0);
  await next.click();
  assert.equal(await score.textContent(),'٩٢٪');
  assert.equal(await pair.evaluate(node=>node.getAnimations({subtree:true}).length),0);
 }
 await page.emulateMedia({reducedMotion:'reduce'});await checkStaticPreview();checks.push('OS reduced motion shows the complete inline preview immediately');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>localStorage.setItem('nisfayn.devicePreferences.v1',JSON.stringify({reducedMotion:true})));await checkStaticPreview();checks.push('in-app reduced motion shows the complete inline preview immediately');
 if(recordWelcome){
  const recording=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ar-SA',recordVideo:{dir:output,size:viewport}});
  try {
   const preview=await recording.newPage();
   await preview.goto(url,{waitUntil:'domcontentloaded'});
   const stories=preview.locator('.wd-pair-preview');
   await stories.waitFor();
   for(const value of ['٩٢٪','٧٨٪','٨٩٪','٨٦٪']){
    await preview.waitForFunction(score=>document.querySelector('.wd-pair-score strong')?.textContent===score,value);
   }
   await stories.getByRole('button',{name:'من كلام نورة'}).click();
   await preview.waitForTimeout(1100);
   const video=preview.video();
   await preview.close();
   await video.saveAs(resolve(output,'welcome-pair-stories.webm'));
  } finally { await recording.close(); }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);await writeFile(resolve(output,'results.json'),JSON.stringify({checks,errors,externalRequests},null,2));console.log(JSON.stringify({checks,output}));
}catch(error){console.error('Browser errors:',errors);await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser?.close();await server.close();}
