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
// Pin what visitors actually see, including the domain-specific personality score.
const rotation = [
 ['الخطوة الرسمية', '77%'], ['عملها بعد الزواج', '77%'], ['قرار العيال', '81%'],
 ['طبع الويكند', '31%'], ['كلمة الأهل', '78%'], ['أول بيت', '79%'],
 ['بين الرياض والخبر', '100%'], ['مصروف البيت', '91%'], ['حدود الطلعات', '81%'],
 ['وقت الزعل', '78%'], ['بداية التعارف', '76%'], ['وقت للعبادة', '79%'],
 ['لو خالف ولدهم اتفاق', '85%'],
];
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
 const activeRow=pair.locator('.wd-pair-row:not([inert])');
 const score=activeRow.locator('.nf-score-tile strong');
 const reading=activeRow.locator('.wd-pair-reading');
 await pair.waitFor();
 const scale=await pair.evaluate(node=>node.getBoundingClientRect().width/node.offsetWidth);
 assert(Math.abs(scale-1)<.002,'welcome preview renders without transformed text');
 assert.equal(await activeRow.locator('.nf-score-tile-copy > span').innerText(),'التوافق');
 assert.equal(await pair.locator('.wd-pair-footer,.wd-pair-controls').count(),0,'evidence strip has no decorative playback controls');
 assert.equal(await score.textContent(),rotation[0][1]);
 const firstScore=await score.elementHandle();
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 await page.waitForFunction(()=>!document.querySelector('.wd-pair-preview').hasAttribute('data-rotating'));
 await page.waitForTimeout(7000);
 assert.equal(await activeRow.locator('.wd-pair-identity > span').innerText(),rotation[0][0],'offscreen captions stay put');
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.waitForFunction(()=>document.querySelector('.wd-pair-identity > span')?.textContent==='أول بيت');
 assert(await firstScore.evaluate(node=>node.isConnected),'changing the factor preserves the score element');
 assert.equal(await score.textContent(),rotation[0][1]);
 assert.match(await reading.innerText(),/بيت مستقل/);
 await page.waitForFunction(topic=>document.querySelector('.wd-pair-row:not([inert]) .wd-pair-identity > span')?.textContent===topic,rotation[1][0]);
 assert.equal(await score.textContent(),rotation[1][1]);
 assert.equal(await activeRow.locator('.nf-score-tile-copy > span').innerText(),'التوافق');
 await activeRow.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
 await pair.getByRole('button',{name:'من كلام عبدالله'}).click();
 assert.match(await reading.innerText(),/أغلب شغل البيت عليها/);
 await page.waitForTimeout(6950);
 assert.equal(await score.textContent(),rotation[1][1]);
 await next.focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>{const rows=[...document.querySelectorAll('.wd-pair-window[data-moving] .wd-pair-row')];return rows.length===2 && rows.every(row=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(row).transform).m42)>1);});
 assert.equal(await activeRow.locator('.nf-score-tile-copy > span').innerText(),'التوافق');
 for(let i=2;i<=rotation.length;i++){
  const [topic,percent]=rotation[i%rotation.length];
  if(i>2){await next.click();await next.click();}
  assert.equal(await activeRow.locator('.wd-pair-identity > span').innerText(),topic);
  assert.equal(await score.textContent(),percent);
  assert((await reading.innerText()).trim().split(/\s+/).length<=14,'one short reading per rotation');
  const fits=await reading.evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);return node.scrollWidth<=node.clientWidth+1&&range.getBoundingClientRect().height<=2*parseFloat(getComputedStyle(node).lineHeight)+1;});
  assert(fits,'reading fits within two lines: '+topic);
 }
 await pair.locator('[data-outgoing]').waitFor({state:'detached'});await next.blur();
 if(captureStills)await page.screenshot({path:resolve(output,'welcome-pair-stories.png'),animations:'disabled'});
 assert.equal(await page.getByRole('dialog').count(),0);
 assert(await page.locator('.nf-join,.nf-mast-login').evaluateAll(nodes=>nodes.every(node=>{
  const b=node.getBoundingClientRect();return node.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));
 })));
 checks.push('pairs rotate together with their portraits, overall scores and marriage decisions; reading a portrait pauses, keyboard navigation wraps through all thirteen');
 const settled=await page.evaluate(()=>({inert:document.querySelector('.wd-welcome').inert,overflow:getComputedStyle(document.body).overflow}));
 assert(launchElapsed<3200,'intro finishes promptly: '+launchElapsed);assert.equal(settled.inert,false);assert.notEqual(settled.overflow,'hidden');assert.deepEqual(await page.evaluate(()=>window.__actions),[]);
 checks.push('full-screen logo intro locks background, finishes within three seconds, and restores interaction');
 await page.locator('.nf-join').click();await page.locator('.nf-mast-login').click();await page.getByRole('button',{name:'الخصوصية وشروط الاستخدام',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.__actions),['register','login','privacy']);checks.push('registration, login and privacy callbacks after intro');
 await page.evaluate(()=>window.__remount());await page.waitForFunction(()=>window.__introSamples.length===2);assert.equal(await page.locator('.wd-welcome').getAttribute('data-opening'),null);assert.equal(await page.locator('.wd-launch-screen').count(),0);assert.equal(await score.textContent(),rotation[0][1]);checks.push('returning to welcome keeps the inline preview visible without replaying it');
 const controls=page.getByRole('group',{name:'استكشف شاشات التطبيق'}).getByRole('button');assert.equal(await controls.count(),4);
 for(let i=0;i<4;i++){await controls.nth(i).click();assert.equal(await controls.nth(i).getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.wd-preview-controls button[aria-pressed="true"]').count(),1);await page.locator('.wd-device-screen img').scrollIntoViewIfNeeded();await page.waitForFunction(()=>{const image=document.querySelector('.wd-device-screen img');return image.complete&&image.naturalWidth>0;});}
 checks.push('all four preview images load and selection state is accessible');
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
  assert.match(await reading.innerText(),/بيت مستقل/);
  assert.equal(await score.textContent(),rotation[0][1]);
  await next.click();
  assert.equal(await score.textContent(),rotation[1][1]);
  assert.equal(await pair.evaluate(node=>node.getAnimations({subtree:true}).length),0);
 }
 await page.emulateMedia({reducedMotion:'reduce'});await checkStaticPreview();checks.push('OS reduced motion shows the complete inline preview immediately');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>localStorage.setItem('nisfayn.devicePreferences.v1',JSON.stringify({reducedMotion:true})));await checkStaticPreview();checks.push('in-app reduced motion shows the complete inline preview immediately');
 if(recordWelcome){
  const recording=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ar-SA',recordVideo:{dir:output,size:viewport}});
  try {
   const preview=await recording.newPage();
   // Sample painted states during the actual launch handoff and subsequent scrolls.
   await preview.addInitScript(()=>{
    window.__pairMotion=[];
    function sample(){
     const card=document.querySelector('.wd-pair-preview:not([hidden])');
     const row=card?.querySelector('.wd-pair-row:not([inert])');
     if(row){
      const level=row.querySelector('.nf-logo-level');
      const offset=getComputedStyle(level).translate.split(' ')[1];
      const people=row.querySelector('.wd-pair-people');
      window.__pairMotion.push({topic:row.querySelector('.wd-pair-identity > span').textContent,
       ring:people.dataset.ringEnding, bandPosition:parseFloat(getComputedStyle(people.querySelector('.wd-portrait-rings')).backgroundPositionY),
       portraitOpacity:Number(getComputedStyle(people.querySelector('img')).opacity), at:performance.now(),
       clip:getComputedStyle(card).clipPath,opacity:Number(getComputedStyle(card).opacity),
       level:parseFloat(offset)||0});
     }
     requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
   });
   await preview.goto(url,{waitUntil:'domcontentloaded'});
   const stories=preview.locator('.wd-pair-preview');
   await stories.waitFor();
   for(const [topic] of rotation.slice(1,7)){
    await preview.waitForFunction(expected=>document.querySelector('.wd-pair-row:not([inert]) .wd-pair-identity > span')?.textContent===expected,topic);
   }
   await stories.getByRole('button',{name:'من كلام نورة'}).click();
   await preview.waitForTimeout(1100);
   const frames=await preview.evaluate(()=>window.__pairMotion);
   for(const ending of ['part','link']){
    const samples=frames.filter(frame=>frame.ring===ending);
    assert(samples.some(frame=>frame.portraitOpacity>.8) && samples.some(frame=>frame.portraitOpacity<.1));
    assert(new Set(samples.map(frame=>frame.bandPosition)).size>=12,ending+' shows distinct band poses');
    console.log(ending,'first ring cue (seconds)',samples[0].at/1000);
   }
   const firstCaption=frames[0];
   const secondCaption=frames.find(frame=>frame.topic!==firstCaption.topic);
   const firstEnding=frames.find(frame=>frame.ring);
   assert(secondCaption.at-firstCaption.at>=6500,'first caption has reading time');
   assert(firstEnding.at-secondCaption.at>=6500,'second caption has reading time before the rings');
   const held=frames.filter(frame=>frame.topic===secondCaption.topic && frame.ring && frame.bandPosition===100);
   assert(held.at(-1).at-held[0].at>=800,'rings settle before the next portraits appear');
   const entrance=frames.filter(frame=>frame.topic===rotation[0][0]);
   assert(entrance.some(frame=>frame.clip!=='none'&&frame.opacity<.4&&frame.level>5));
   assert(entrance.some(frame=>frame.clip==='none'&&frame.opacity===1&&frame.level===0));
   const lowerScore=frames.filter(frame=>frame.topic===rotation[3][0]);
   assert(lowerScore.some(frame=>frame.level < -5) && lowerScore.some(frame=>frame.level===0));
   checks.push('recorded the card unfolding and the liquid settling at the initial and subsequent scores');
   const video=preview.video();
   await preview.close();
   await video.saveAs(resolve(output,'welcome-pair-stories.webm'));
  } finally { await recording.close(); }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);await writeFile(resolve(output,'results.json'),JSON.stringify({checks,errors,externalRequests},null,2));console.log(JSON.stringify({checks,output}));
}catch(error){console.error('Browser errors:',errors);await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser?.close();await server.close();}
