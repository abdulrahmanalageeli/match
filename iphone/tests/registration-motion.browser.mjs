// Offline temporal QA for an extracted answer, a partner criterion and SMS verification.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = process.argv.includes('--baseline');
const output = resolve(root, '.tmp/motion-registration', baseline ? 'before' : 'after');
const { chromium } = createRequire(import.meta.url)(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
await mkdir(output, {recursive:true});
const fixture = `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {HybridAssessment} from '/src/interview/HybridAssessment';
import {PartnerCriteriaFields} from '/src/onboarding/MarriageFields';
import {confirmSignupSms} from '/src/auth/SignupSms';
import '/src/design.css';import '/src/flows.css';import '/src/screens.css';import '/src/motion.css';import '/src/interview/interview.css';
import '/src/onboarding/journey.css';import '/src/onboarding/arrivalJourney.css';import '/src/onboarding/arrivalAssessments.css';import '/src/arrivalSurfaces.css';import '/src/typography.css';import '/src/accessibility.css';
const proposal={id:'personality:depth:self',kind:'personality',fieldId:'depth',side:'self',values:['D'],summary:'عمق الحوار',evidence:[{turnId:'intro',quote:'أحب أن نأخذ وقتنا في الحديث'}],needsClarification:false};
function Fixture(){
 const [choices,change]=useState({[proposal.id]:proposal.values}),[criteria,setCriteria]=useState({});
 if(location.search==='?sms')return <button onClick={()=>confirmSignupSms('fixture@example.test')}>تأكيد الجوال</button>;
 if(location.search==='?criteria')return <main className="nf-intake nf-intake--new" dir="rtl"><PartnerCriteriaFields required gender="woman" value={criteria} onChange={setCriteria}/></main>;
 return <dialog ref={el=>{if(el&&!el.open)el.showModal()}} className="wi-dialog" dir="rtl"><div className="wi-content"><HybridAssessment choices={choices} aiProposals={[proposal]} onChange={change} onComplete={()=>{}}/></div></dialog>
}
createRoot(document.querySelector('#root')).render(<div className="phone-app"><Fixture/></div>);
`;
const server = await createServer({root, mode:'demo',server:{host:'127.0.0.1',port:5348,strictPort:true,hmr:false},
 cacheDir:resolve(root,'node_modules/.vite-motion-registration'),optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react','react-native-reanimated','react-native-worklets','@capacitor/core','@supabase/supabase-js']},
 plugins:[{name:'motion-registration-fixture',enforce:'pre',resolveId(id){if(id==='virtual:qa-registration')return '\0qa-registration';},async load(id){if(id==='\0qa-registration')return (await transformWithEsbuild(fixture,'fixture.tsx',{loader:'tsx',jsx:'automatic'})).code;},
 configureServer(dev){dev.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/__motion'))return next();res.setHeader('Content-Type','text/html');res.end(await dev.transformIndexHtml('/__motion','<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/@id/__x00__qa-registration"></script></body></html>'));});}}]});
let browser;
const results=[];
try{
 await server.listen();
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const [width,height,reduced] of [[375,667,false],[390,844,false],[430,932,false],[375,667,true]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:reduced?'reduce':'no-preference'});
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  let smsAttempts = 0;
  await page.route('**/*', route => {
   const url = new URL(route.request().url());
   if (url.hostname === '127.0.0.1') return route.continue();
   if (url.pathname !== '/api/signup-sms') return route.abort();
   const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'};
   if (route.request().method() === 'OPTIONS') return route.fulfill({status:204,headers});
   smsAttempts++;
   return route.fulfill(smsAttempts === 1 ? {status:503,json:{error:'unavailable'},headers} : {json:{proof:'fixture'},headers});
  });
  for(const flow of ['luna','criteria','sms']){
   await page.goto('http://127.0.0.1:5348/__motion?'+flow,{waitUntil:'commit',timeout:90000});
   await page.waitForSelector('#root > *',{timeout:90000});if(width===430)await page.evaluate(()=>document.documentElement.dataset.nfText='large');
   let trigger,target;
   if(flow==='luna'){trigger=page.locator('.wi-hybrid-captured-review > summary');target='.wi-hybrid-captured-review .wi-hybrid-review-fields';}
   if(flow==='criteria'){trigger=page.locator('.nf-criterion-modes').first().getByRole('button',{name:'شرط أساسي'});target='.nf-criterion-target';}
   if(flow==='sms'){await page.getByRole('button',{name:'تأكيد الجوال'}).click();await page.locator('input[type=tel]').fill('0500000000');trigger=page.locator('.nf-sms-dialog .f-primary');target='.nf-sms-code';
    await trigger.click();await page.locator('.nf-sms-dialog [role=alert]').waitFor();assert.equal(await page.locator(target).count(),0);}
   await trigger.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
   // Start sampling in the capture phase, before React updates or the details element opens.
   await trigger.evaluate((el,selector)=>el.addEventListener('click',()=>{
    window.samples=[];const start=performance.now();
    function frame(){const node=document.querySelector(selector);if(node&&node.getClientRects().length){const style=getComputedStyle(node);window.samples.push({ms:Math.round(performance.now()-start),opacity:Number(style.opacity),transform:style.transform});}if(performance.now()-start<460)requestAnimationFrame(frame);else window.finished=true;}
    requestAnimationFrame(frame);
   },{once:true,capture:true}),target);
   await trigger.click();await page.locator(target).first().waitFor();await page.waitForFunction(()=>window.finished);
   const frames=await page.evaluate(()=>window.samples);
   assert.ok(frames.length>1);
   assert.equal(frames.at(-1).opacity,1);
   if(reduced)assert.ok(frames.every(f=>f.transform==='none'&&f.opacity===1));
   if(!baseline&&!reduced)assert.ok(frames.some(f=>f.transform!=='none'||f.opacity<1),flow+' must communicate its state change');
   if(flow==='sms')assert.equal(await page.locator(target).evaluate(el=>el===document.activeElement),true);
   if(flow==='luna'){await page.locator('.wi-hybrid-evidence summary').click();assert.match(await page.locator('.wi-hybrid-evidence q').innerText(),/وقت/);}
   if(width===390&&!process.argv.includes('--no-shots'))await page.screenshot({path:resolve(output,flow+'.png')});
   if(flow==='luna'){const choice=page.locator('.wi-extracted-answer select');if(!baseline){await choice.selectOption('B');assert.match(await page.locator('.wi-extracted-answer').innerText(),/عدّلت/);}}
   if(flow==='criteria'&&!baseline){const mode=page.locator('.nf-criterion-modes').first();await mode.getByRole('button',{name:'أفضل',exact:true}).click();assert.equal(await mode.getAttribute('data-mode'),'prefer');}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   results.push({flow,width,height,reduced,frames});
  }
  assert.deepEqual(pageErrors,[]);await page.close();
 }
 await writeFile(resolve(output,'frames.json'),JSON.stringify(results));
 console.log('Passed '+results.length+' RTL motion samples; evidence in '+output);
}finally{await browser?.close();await server.close();}
