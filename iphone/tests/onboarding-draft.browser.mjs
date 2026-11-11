// Explicit local-only browser smoke. No real accounts, APIs, or signup writes.
// Run: node tests/onboarding-draft.browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const owner = '11111111-1111-1111-1111-111111111111';
const drafts = new Map(), calls = [];
const artifacts = process.env.NISFAYN_SMOKE_OUTPUT || resolve(root, '.tmp/onboarding-draft-smoke');
await mkdir(artifacts, { recursive: true });
const cloudMock = `
export const cloud={},cloudSelected=true,cloudConnection={url:'http://127.0.0.1',key:'mock'},phoneOtpEnabled=false;
export class CloudError extends Error{}
export async function cloudSessionId(){return window.__smokeSignedIn===false?null:'${owner}'}
export async function cloudLogout(){window.__smokeSignedIn=false}
export async function callRpc(name,params,expectedUser){
 if(await cloudSessionId()!==expectedUser)throw new Error('Mock session mismatch');
 const response=await fetch('/__draft-rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,params,expectedUser})});
 if(!response.ok)throw new Error('Mock RPC unavailable');return response.json();
}
export function createRecoveryClient(){return cloud}
export async function cloudRequest(){throw new Error('Signup is prohibited in this smoke test')}
export async function resendSignupConfirmation(){throw new Error('No email in smoke test')}
export async function sendPhoneOtp(){throw new Error('No OTP in smoke test')}
export async function verifyPhoneOtp(){throw new Error('No OTP in smoke test')}
`;
const fixture = `
import React,{useRef,useState} from 'react';import{createRoot}from'react-dom/client';
import'/src/ambient.css';import'/src/home.css';
import'/src/design.css';import'/src/flows.css';import'/src/screens.css';import'/src/motion.css';
import'/src/onboarding/arrivalJourney.css';import'/src/onboarding/arrivalAssessments.css';import'/src/arrivalSurfaces.css';
import{GuidedApplication}from'/src/onboarding/GuidedApplication.tsx';
import{discardLocalIntake}from'/src/onboarding/persistence.ts';import{cloudLogout}from'/src/cloud.ts';
function Fixture(){const[view,setView]=useState('form');const ref=useRef(null);
 async function logout(){await discardLocalIntake('${owner}');ref.current=null;await cloudLogout();setView('signed-out')}
 return view==='form'?<GuidedApplication initial={null} previouslyApproved={false} busy={false} back={()=>setView('later')} onPrivacy={()=>{}} save={()=>{throw new Error('Must not submit an application')}} draftRef={ref} draftOwner='${owner}' demo={false}/>
 :<main dir='rtl' style={{padding:24}}>{view==='later'?<><h1>حُفظ التقدّم</h1><button onClick={()=>setView('form')}>استئناف التسجيل</button><button onClick={logout}>تسجيل الخروج</button></>
 :<><h1>تم تسجيل الخروج</h1><button onClick={()=>{window.__smokeSignedIn=true;setView('form')}}>الدخول إلى الحساب نفسه</button></>}</main>
}createRoot(document.getElementById('root')).render(<div className='phone-app' dir='rtl' lang='ar'><Fixture/></div>);
`;
const server = await createServer({
 root, configFile: resolve(root, 'vite.config.ts'), cacheDir:resolve(root,'node_modules/.vite-draft-smoke'), server: { host: '127.0.0.1', port: 5277, strictPort: true },
 optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react','@capacitor/core','react-native-reanimated','react-native-worklets'],esbuildOptions:{resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.mjs','.json']}},
 plugins: [{ name: 'isolated-draft-browser-smoke', enforce: 'pre',
  resolveId(id) { if (id === 'virtual:nisfayn-draft-smoke') return '\0nisfayn-draft-smoke'; },
  async load(id) {
   if (id.replaceAll('\\', '/').endsWith('/src/cloud.ts')) return cloudMock;
   // Exercise the actual form and Reanimated layout; its decorative canvas uses
   // the shipped SVG fallback so this draft test does not load a native renderer.
   if (id.replaceAll('\\', '/').endsWith('/src/motion/SkiaSurface.tsx')) return `import{createElement}from'react';export function SkiaSurface({className,fallback}){return createElement('div',{className,'aria-hidden':true},fallback)}`;
   if (id === '\0nisfayn-draft-smoke') return (await transformWithEsbuild(fixture, 'smoke.tsx', { loader: 'tsx', jsx: 'automatic' })).code;
  },
  configureServer(dev) { dev.middlewares.use(async (req, res, next) => {
   if (req.url === '/__draft-rpc' && req.method === 'POST') {
    let body='';for await(const chunk of req)body+=chunk;
    const input=JSON.parse(body);assert.equal(input.expectedUser,owner);assert.equal(input.name,'marriage_onboarding_draft');
    calls.push(input);const {command,payload}=input.params;
    if(command==='save')drafts.set(owner,structuredClone(payload));
    if(command==='delete')drafts.delete(owner);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(command==='load'?drafts.get(owner)??null:{saved:true}));return;
   }
   if (req.url?.startsWith('/__draft-smoke')) {
    const html=await dev.transformIndexHtml('/__draft-smoke','<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/@id/__x00__nisfayn-draft-smoke"></script></body></html>');
    res.setHeader('Content-Type','text/html');res.end(html);return;
   }next();
  }); }
 }],
});
await server.listen();
let browser,page;
const errors=[], interactionIssues=[];
try {
 browser=await chromium.launch({headless:true,channel:'chrome'});
 page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ar-SA',reducedMotion:'reduce'});
 page.setDefaultTimeout(15000);
 page.on('pageerror',error=>{errors.push(error.message);console.error('SMOKE_BROWSER_ERROR',error.message)});
 await page.route('**/*',route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)||url.protocol==='data:'?route.continue():route.abort();});
 await page.goto('http://127.0.0.1:5277/__draft-smoke',{waitUntil:'networkidle',timeout:60000});
 console.log('SMOKE_LOADED');
 async function capture(name){await page.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur();window.scrollTo({top:0,left:0,behavior:'instant'});});await page.waitForTimeout(400);await page.screenshot({path:resolve(artifacts,name)});}
 async function chooseOption(label,query,option){
  const input=page.getByRole('combobox',{name:label,exact:true});await input.fill(query);
  try{await page.getByRole('option',{name:option,exact:true}).click({timeout:2500});}
  catch(error){
   const file=resolve(artifacts,'dropdown-'+interactionIssues.length+'.png');await page.screenshot({path:file,fullPage:true});
   const details=await page.getByRole('option',{name:option,exact:true}).evaluate(node=>{const r=node.getBoundingClientRect();return{rect:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},hit:document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2)?.outerHTML?.slice(0,250),scrollY}});
   interactionIssues.push({label,issue:'Touch option intercepted; continued with keyboard selection',details,screenshot:file});
   await input.press('Enter');
  }
 }
 await page.getByLabel('الاسم المعروض').fill('مريم الاختبار');
 await page.getByRole('button',{name:'امرأة',exact:true}).click();
 await page.locator('input[type="date"]').fill('1997-01-01');
 await chooseOption('مدينة الإقامة','الرياض','الرياض');
 await page.locator('.nf-intake-save-status[data-state="saved"]').waitFor();
 assert.equal(drafts.get(owner).answers.displayName,'مريم الاختبار');
 await capture('01-identity-saved.png');
 await page.reload({waitUntil:'networkidle'});
 assert.equal(await page.getByLabel('الاسم المعروض').inputValue(),'مريم الاختبار');
 assert.equal(await page.getByRole('combobox',{name:'مدينة الإقامة',exact:true}).inputValue(),'الرياض');
 await capture('02-identity-restored.png');
 await page.getByRole('button',{name:'متابعة',exact:true}).click();
 await chooseOption('مجال العمل أو الوضع المهني','التعليم','التعليم والتدريب');
 await page.getByLabel('نبذة قصيرة',{exact:true}).fill('أحب القراءة والمشي والوقت الهادئ مع الأسرة، وأتطلع إلى شراكة قائمة على الاحترام والتفاهم.');
 await page.getByRole('button',{name:'متابعة',exact:true}).click();
 await page.getByText('أوافق على معالجة التفاصيل الحساسة · اختياري',{exact:true}).click();
 await page.getByText('أوافق على عرض التفاصيل الحساسة · اختياري',{exact:true}).click();
 await page.getByText('الدين في حياتي',{exact:true}).click();
 await page.getByRole('button',{name:'سنّي',exact:true}).click();
 await page.locator('.nf-intake-save-status[data-state="saved"]').waitFor();
 assert.equal(drafts.get(owner).permissions.sensitiveProfile,true);
 assert.equal(drafts.get(owner).answers.marriageBasics.religiousAffiliation,'sunni');
 assert.equal(drafts.get(owner).permissions.sensitivePublication,undefined);
 await page.reload({waitUntil:'networkidle'});
 await page.getByText(/معالجة التفاصيل الحساسة مفعّلة/).waitFor();
 assert.equal(await page.getByRole('checkbox',{name:/أوافق على عرض التفاصيل الحساسة/}).isChecked(),false);
 await page.getByText('الدين في حياتي',{exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'سنّي',exact:true}).getAttribute('aria-pressed'),'true');
 await capture('03-sensitive-restored.png');
 const privateBrowserStorage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));
 assert(!privateBrowserStorage.includes('مريم الاختبار'));assert(!privateBrowserStorage.includes('religiousAffiliation'));
 await page.getByRole('button',{name:'إكمال لاحقًا',exact:true}).click();
 await page.getByRole('button',{name:'تسجيل الخروج',exact:true}).click();
 assert(drafts.has(owner),'Signout must retain the server draft');
 assert(!calls.some(call=>call.params.command==='delete'),'Signout must not delete the server draft');
 await page.getByRole('button',{name:'الدخول إلى الحساب نفسه',exact:true}).click();
 await page.getByText(/معالجة التفاصيل الحساسة مفعّلة/).waitFor();
 assert.equal(await page.getByRole('checkbox',{name:/أوافق على عرض التفاصيل الحساسة/}).isChecked(),false);
 await capture('04-return-after-signout.png');
 await page.getByRole('button',{name:'رجوع',exact:true}).click();
 assert.equal(await page.locator('textarea[data-field="bio"]').inputValue(),'أحب القراءة والمشي والوقت الهادئ مع الأسرة، وأتطلع إلى شراكة قائمة على الاحترام والتفاهم.');
 await page.getByRole('button',{name:'رجوع',exact:true}).click();
 assert.equal(await page.getByLabel('الاسم المعروض').inputValue(),'مريم الاختبار');
 assert.equal(await page.locator('input[type="date"]').inputValue(),'1997-01-01');
 assert.equal(await page.getByRole('combobox',{name:'مدينة الإقامة',exact:true}).inputValue(),'الرياض');
 await page.locator('.nf-intake-save-status[data-state="saved"]').waitFor();
 const viewport=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.equal(viewport.scroll,viewport.width,'Onboarding must not overflow the mobile viewport');
 assert.deepEqual(errors,[]);
 const result={passed:['identity autosave','reload restores all identity fields','sensitive processing permission and answer restored','publication consent remains unchecked','private answers absent from browser storage','save for later + logout retains account draft','same account sign-in restores chapter and answers','mobile viewport has no horizontal overflow'],artifacts,calls:calls.length,errors,interactionIssues};
 await writeFile(resolve(artifacts,'results.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
} catch(error) {
 await page?.screenshot({path:resolve(artifacts,'failure.png'),fullPage:true}).catch(()=>{});
 await writeFile(resolve(artifacts,'failure.json'),JSON.stringify({error:error.message,errors,interactionIssues,draft:drafts.get(owner),calls},null,2));
 if(page)await writeFile(resolve(artifacts,'failure-dom.txt'),await page.locator('body').innerText().catch(()=>''));
 throw error;
} finally {await browser?.close();await server.close();}
