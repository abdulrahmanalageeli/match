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
 useLayoutEffect(()=>{requestAnimationFrame(()=>{const main=document.querySelector('.wd-welcome');window.__introSamples.push({opening:main.hasAttribute('data-opening'),animations:document.getAnimations().filter(a=>a.playState==='running').map(a=>a.animationName),loginDisabled:document.querySelector('.nf-mast-login').disabled,joinDisabled:document.querySelector('.nf-join').disabled});if(cycle===0){document.querySelector('.nf-mast-login').click();document.querySelector('.nf-join').click();}});},[cycle]);
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
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ar-SA'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1'||u.protocol==='data:')return route.continue();externalRequests.push(u.origin);return route.abort();});
 page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__introSamples.length>0);
 const opening=await page.evaluate(()=>window.__introSamples[0]);assert(opening.opening&&opening.animations.includes('wd-logo-draw'),'logo draws on first mount');assert(!opening.loginDisabled&&!opening.joinDisabled);
 assert.deepEqual(await page.evaluate(()=>window.__actions),['login','register']);checks.push('logo intro runs while login and registration remain usable');
 await page.locator('.nf-join').click();await page.locator('.nf-mast-login').click();await page.getByRole('button',{name:'الخصوصية وشروط الاستخدام',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.__actions),['login','register','register','login','privacy']);checks.push('registration, login and privacy callbacks');
 await page.evaluate(()=>window.__remount());await page.waitForFunction(()=>window.__introSamples.length===2);assert.equal(await page.locator('.wd-welcome').getAttribute('data-opening'),null);checks.push('returning to welcome does not replay intro');
 const controls=page.getByRole('group',{name:'استكشف شاشات التطبيق'}).getByRole('button');assert.equal(await controls.count(),3);
 for(let i=0;i<3;i++){await controls.nth(i).click();assert.equal(await controls.nth(i).getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.wd-preview-controls button[aria-pressed="true"]').count(),1);await page.locator('.wd-device-screen img').scrollIntoViewIfNeeded();await page.waitForFunction(()=>{const image=document.querySelector('.wd-device-screen img');return image.complete&&image.naturalWidth>0;});}
 checks.push('all three preview images load and selection state is accessible');
 await page.getByRole('button',{name:'تعرّف على منهج وُدَين',exact:true}).click();await page.locator('.wd-why-dialog[open]').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.wd-why-dialog[open]').count(),0);checks.push('method dialog opens and closes');
 await controls.nth(0).click();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1800);
 for(const width of [320,390,1024]){
  await page.setViewportSize({width,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(100);
  const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth,root:document.querySelector('.wd-welcome').getBoundingClientRect().width}));assert(layout.scroll<=width+1&&layout.root<=width+1,JSON.stringify({width,...layout}));
  const small=await page.locator('.wd-welcome button,.wd-welcome a').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<43.9;}).map(n=>({text:n.textContent.trim(),height:n.getBoundingClientRect().height})));assert.deepEqual(small,[],'interactive targets should be at least 44px high');
  if(width===390){await page.screenshot({path:resolve(output,'welcome-390-hero.png')});await page.screenshot({path:resolve(output,'welcome-390-full.png'),fullPage:true});}
  if(width===1024)await page.screenshot({path:resolve(output,'welcome-1024-full.png'),fullPage:true});
 }
 checks.push('320/390/1024 layouts fit and interactive targets are at least 44px high');
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__introSamples.length>0);assert.equal(await page.locator('.wd-welcome').getAttribute('data-opening'),null);assert.deepEqual(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').map(a=>a.animationName)),[]);checks.push('OS reduced motion skips intro');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>localStorage.setItem('nisfayn.devicePreferences.v1',JSON.stringify({reducedMotion:true})));await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__introSamples.length>0);assert.equal(await page.locator('.wd-welcome').getAttribute('data-opening'),null);assert.deepEqual(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').map(a=>a.animationName)),[]);checks.push('in-app reduced motion skips intro');
 assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);await writeFile(resolve(output,'results.json'),JSON.stringify({checks,errors,externalRequests},null,2));console.log(JSON.stringify({checks,output}));
}catch(error){console.error('Browser errors:',errors);await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser?.close();await server.close();}
