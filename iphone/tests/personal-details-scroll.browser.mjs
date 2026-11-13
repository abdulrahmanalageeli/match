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
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {MarriageBasicsFields} from '/src/onboarding/MarriageFields.tsx';
import '/src/design.css';import '/src/flows.css';import '/src/screens.css';
function Fixture(){const [value,setValue]=useState({});return <main className="nf-intake" dir="rtl"><div style={{height:1000}}/><MarriageBasicsFields value={value} onChange={setValue} gender="man" required/><div style={{height:700}}/></main>}
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
 page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('.nf-marriage-group').first().waitFor();
 const height=page.getByRole('button',{name:/^الطول/});await height.scrollIntoViewIfNeeded();
 const before=await page.evaluate(()=>scrollY);assert(before>100); await page.evaluate(()=>{const close=HTMLDialogElement.prototype.close;HTMLDialogElement.prototype.close=function(...args){close.apply(this,args);window.scrollTo(0,0);};});
 await height.click();await page.getByRole('option',{name:'١٧٥ سم',exact:true}).click();
 await page.waitForTimeout(300);
 assert(Math.abs(before-await page.evaluate(()=>scrollY))<2,'picker restores position after native focus scroll'); console.log(JSON.stringify({case:'height',before,after:await page.evaluate(()=>scrollY),focus:await page.evaluate(()=>document.activeElement?.outerHTML.slice(0,200))}));
 const group=page.locator('[data-section="بداية تناسبك"]');await group.locator('summary').click();
 const option=group.locator('.nf-detail-choices button').first();await option.scrollIntoViewIfNeeded();
 const beforeOption=await page.evaluate(()=>scrollY);await option.click();await page.waitForTimeout(300);
 assert(Math.abs(beforeOption-await page.evaluate(()=>scrollY))<2,'inline choice preserves position'); assert(await group.evaluate(n=>n.open)); console.log(JSON.stringify({case:'timeline',before:beforeOption,after:await page.evaluate(()=>scrollY),open:await group.evaluate(n=>n.open),errors}));
}finally{await browser?.close();await server.close();}
