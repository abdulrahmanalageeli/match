// Local-only visual check: actual components and motion, synthetic API responses.
// Run: node tests/interview-design.browser.mjs. Never contacts a production API.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import topics from '../src/interview/catalog.json' with { type: 'json' };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const artifacts = resolve(root, '.tmp/interview-design-review');
await mkdir(artifacts, { recursive: true });
const proposals = [
 { id:'timeline-self',kind:'preference',fieldId:'marriage_timeline',side:'self',values:['A'],summary:'تفضّل أن تبدأ الخطوة الرسمية خلال الأشهر القادمة عندما تجد الشخص المناسب.',evidence:[{turnId:'t1',quote:'أفضّل ندخل الأهل خلال شهرين إذا ارتحنا لبعض'}],needsClarification:false },
 { id:'repair-self',kind:'preference',fieldId:'repair_after_conflict',side:'self',values:['B'],summary:'تأخذ مساحة للهدوء ثم تعود إلى الحوار في وقت واضح للطرفين.',evidence:[{turnId:'t2',quote:'آخذ مهلة قصيرة ونرجع نتكلم بنفس اليوم'}],needsClarification:false },
 { id:'timeline-partner',kind:'preference',fieldId:'marriage_timeline',side:'partner',values:['A'],summary:'ترغب في شريك مستعد للخطوة الرسمية في المدى القريب.',evidence:[{turnId:'t1',quote:'وأبغى الطرف الآخر مستعد لنفس المدة'}],needsClarification:false },
 { id:'closeness-partner',kind:'preference',fieldId:'closeness_pace',side:'partner',values:['B'],summary:'تقدّر التقارب الطبيعي الذي يبنى على الوقت والاطمئنان المتبادل.',evidence:[{turnId:'t3',quote:'أحب القرب يتدرج بيننا مع الوقت'}],needsClarification:false },
];
const base = { version:'interview-v1',consentVersion:'wudayn-interview-v1',model:'gpt-6-luna',promptVersion:'wudayn-interview-1',status:'active',turns:[{id:'t1',topic:'intent',question:topics[0].question,answer:'أفضّل ندخل الأهل خلال شهرين إذا ارتحنا لبعض، وأبغى الطرف الآخر مستعد لنفس المدة',skipped:false}],currentQuestion:{topic:'family',text:topics[3].question,suggestions:[]},proposals,readiness:[{id:'nextStep',text:'تفضّل إشراك الأهل بعد أن تتضح النية ويكون الارتياح متبادلًا.',evidence:proposals[0].evidence}],clarifications:[],confirmed:[],lastRequestId:null,lastMode:'luna',pendingAnalysis:false,draftAnswer:'',reviewSharing:false,confirmedAt:null };
const apiMock = `
const base=${JSON.stringify(base)};
const mode=new URLSearchParams(location.search).get('mode');
let snapshot={document:mode==='welcome'?null:{...base,status:mode==='question'?'active':'review'},revision:mode==='welcome'?0:1};
window.__interviewCalls=[];
export class InterviewError extends Error{}
export async function requestInterview(auth,payload){
 window.__interviewCalls.push(payload.action);
 await new Promise(resolve=>setTimeout(resolve,60));
 if(payload.action==='start')snapshot={document:{...base,turns:[],currentQuestion:{topic:'intent',text:${JSON.stringify(topics[0].question)},suggestions:[]}},revision:1};
 if(payload.action==='draft')snapshot={...snapshot,document:{...snapshot.document,draftAnswer:payload.answer},revision:snapshot.revision+1};
 if(payload.action==='confirm')snapshot={...snapshot,document:{...snapshot.document,status:'confirmed',confirmed:payload.choices.map(choice=>({...base.proposals.find(proposal=>proposal.id===choice.id),values:choice.values})),reviewSharing:payload.shareReview},revision:snapshot.revision+1};
 if(payload.action==='review')snapshot={...snapshot,document:{...snapshot.document,status:'review'},revision:snapshot.revision+1};
 if(payload.action==='resume')snapshot={...snapshot,document:{...snapshot.document,status:'active'},revision:snapshot.revision+1};
 if(payload.action==='delete')throw Error('Deletion is not part of a visual check');
 return structuredClone(snapshot);
}
`;
const fixture = `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import'/src/ambient.css';import'/src/home.css';import'/src/design.css';import'/src/flows.css';import'/src/screens.css';import'/src/motion.css';import'/src/onboarding/arrivalJourney.css';import'/src/onboarding/arrivalAssessments.css';import'/src/arrivalSurfaces.css';import'/src/typography.css';
import{initializeDevicePreferences}from'/src/settings/preferences';
import{InterviewPanel,InterviewEntry}from'/src/interview/InterviewPanel';
initializeDevicePreferences();
function Fixture(){const[open,setOpen]=useState(new URLSearchParams(location.search).get('mode')!=='entry');return <><main style={{padding:24,maxWidth:600,margin:'auto'}}><InterviewEntry available open={()=>setOpen(true)}/></main><InterviewPanel open={open} auth={{testSession:'synthetic-local-only'}} onClose={()=>setOpen(false)} onApply={()=>{window.__interviewApplied=true}}/></>}
createRoot(document.getElementById('root')).render(<div className='phone-app' dir='rtl' lang='ar'><Fixture/></div>);
`;
const server = await createServer({
 root,configFile:resolve(root,'vite.config.ts'),cacheDir:resolve(root,'node_modules/.vite-interview-design'),server:{host:'127.0.0.1',port:5278,strictPort:true},
 optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react','@capacitor/core','react-native-reanimated','react-native-worklets'],esbuildOptions:{resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.mjs','.json']}},
 plugins:[{name:'isolated-interview-design',enforce:'pre',
  resolveId(id){if(id==='virtual:interview-design')return '\0interview-design'},
  async load(id){if(id.replaceAll('\\','/').endsWith('/src/interview/api.ts'))return apiMock;if(id==='\0interview-design')return(await transformWithEsbuild(fixture,'fixture.tsx',{loader:'tsx',jsx:'automatic'})).code},
  configureServer(dev){dev.middlewares.use(async(req,res,next)=>{
   if(req.url?.startsWith('/__interview-design')){const html=await dev.transformIndexHtml('/__interview-design','<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/@id/__x00__interview-design"></script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);return}next();
  })}
 }],
});
await server.listen();
let browser,page;
const errors=[],externalRequests=[],checks=[];
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ar-SA'});
 page.setDefaultTimeout(15000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(url.hostname)||url.protocol==='data:')return route.continue();externalRequests.push(url.origin);return route.abort()});
 async function load(mode){await page.goto('http://127.0.0.1:5278/__interview-design?mode='+mode,{waitUntil:'networkidle',timeout:60000});if(mode!=='entry')await page.locator('#wi-title').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(650)}
 async function capture(name){await page.screenshot({path:resolve(artifacts,name+'.png')})}
 async function noOverflow(label){const metrics=await page.evaluate(()=>{const node=document.querySelector('dialog[open]')||document.documentElement;return{viewport:innerWidth,document:document.documentElement.scrollWidth,client:node.clientWidth,scroll:node.scrollWidth}});assert(metrics.document<=metrics.viewport+1&&metrics.scroll<=metrics.client+1,`${label}: horizontal overflow ${JSON.stringify(metrics)}`);checks.push(label+' fits')}
 await load('entry');await capture('00-entry');await noOverflow('390 entry');
 await load('welcome');await capture('01-welcome');await noOverflow('390 welcome');
 assert.equal(await page.getByRole('button',{name:'خلّنا نبدأ',exact:true}).isEnabled(),false);checks.push('consent remains required');
 await page.locator('.wi-consent input').check();
 await page.evaluate(()=>{window.__interviewMotion=[];const observe=new MutationObserver(()=>{const target=document.querySelector('.wi-question');if(!target)return;observe.disconnect();let remaining=35;const sample=()=>{window.__interviewMotion.push({opacity:Number(getComputedStyle(target).opacity),engine:target.dataset.motionEngine});if(--remaining)requestAnimationFrame(sample)};requestAnimationFrame(sample)});observe.observe(document.querySelector('dialog'),{subtree:true,childList:true})});
 await page.getByRole('button',{name:'خلّنا نبدأ',exact:true}).click();await page.locator('.wi-question').waitFor();await page.waitForTimeout(700);
 const motion=await page.evaluate(()=>window.__interviewMotion);
 await writeFile(resolve(artifacts,'motion.json'),JSON.stringify(motion,null,2));
 const settledOpacity=await page.locator('.wi-question').evaluate(node=>Number(getComputedStyle(node).opacity));
 assert(motion.length>5&&motion.some(frame=>frame.engine==='reanimated'&&frame.opacity<.95)&&settledOpacity>.99,'welcome → question should perform and finish its real Reanimated entrance');checks.push('Reanimated question entrance runs and settles');
 await load('question');await capture('02-question');await noOverflow('390 question');
 await load('review');await capture('03-review');await noOverflow('390 review');
 await page.locator('.wi-proposal details').first().locator('summary').click();await page.waitForTimeout(300);await capture('04-evidence');
 await page.getByRole('button',{name:'اختيار الواضح منها',exact:true}).click();
 await page.locator('.wi-review>.wi-button-primary').click();await page.locator('.wi-complete').waitFor();await page.waitForTimeout(600);await capture('05-complete');assert.equal(await page.evaluate(()=>window.__interviewApplied),true);checks.push('confirmation reaches completion');
 await page.setViewportSize({width:320,height:740});
 for(const mode of ['entry','welcome','question','review']){await load(mode);await noOverflow('320 '+mode)}
 await capture('06-review-320');
 await page.emulateMedia({reducedMotion:'reduce'});await load('welcome');
 const reducedAnimations=await page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running').map(animation=>animation.animationName||animation.effect?.target?.className||'animation'));
 assert.deepEqual(reducedAnimations,[],'system reduced motion must settle decorative animations');checks.push('system reduced motion settles');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.addInitScript(()=>localStorage.setItem('nisfayn.devicePreferences.v1',JSON.stringify({reducedMotion:true})));await load('welcome');
 const appReducedAnimations=await page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running').map(animation=>animation.animationName||'animation'));
 assert.deepEqual(appReducedAnimations,[],'app reduced motion must settle decorative animations');checks.push('app reduced motion settles');
 assert.deepEqual(errors,[],'no browser rendering errors');assert.deepEqual(externalRequests,[],'fixture must stay local');
 await writeFile(resolve(artifacts,'results.json'),JSON.stringify({checks,errors,externalRequests,artifacts},null,2));console.log(JSON.stringify({checks,artifacts}));
}catch(error){await page?.screenshot({path:resolve(artifacts,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(artifacts,'failure.json'),JSON.stringify({error:error.message,errors,externalRequests},null,2));throw error}
finally{await browser?.close();await server.close()}
