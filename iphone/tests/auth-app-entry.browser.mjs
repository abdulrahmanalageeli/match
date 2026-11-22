// Local-only account entry and submitted application, with stubbed service callbacks.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output = resolve(root, '.tmp/auth-app-entry');
await mkdir(output, { recursive: true });
const fixture = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {Capacitor} from '@capacitor/core';
import {Auth,Pending} from '/src/Screens.tsx';import {SupportProvider} from '/src/help/SupportContact.tsx';import '/src/design.css';import '/src/flows.css';import '/src/screens.css';import '/src/motion.css';import '/src/onboarding/arrivalJourney.css';import '/src/arrivalSurfaces.css';import '/src/typography.css';import '/src/accessibility.css';
const params=new URLSearchParams(location.search);
if(params.has('native')){Capacitor.isNativePlatform=()=>true;Capacitor.getPlatform=()=>'ios'}
window.__submitted=[];window.__sms=[];window.__privacy=0;window.__back=0;window.__social=[];
const localSupport={list:async()=>({items:[],nextCursor:null}),create:async()=>{throw new Error('Unexpected support ticket creation')}};
function Submitted(){const[busy,setBusy]=useState(false);return <SupportProvider source={localSupport}><Pending busy={busy} back={()=>window.__back++} refresh={()=>{window.__refreshes++;setBusy(true);window.__finishRefresh=()=>setBusy(false)}}/></SupportProvider>}
window.__refreshes=0;
function Fixture(){const[login,setLogin]=useState(params.has('login'));return <div className="phone-app">{params.has('pending')?<Submitted/>:<Auth login={login} ready busy={false} back={()=>window.__back++} switchMode={()=>setLogin(v=>!v)} submit={(...args)=>window.__submitted.push(args)} onSocial={provider=>window.__social.push(provider)} onPrivacy={()=>window.__privacy++} onDemo={()=>{}} onPhoneVerified={()=>{}}/>}</div>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
const server = await createServer({root,mode:'demo',configFile:resolve(root,'vite.config.ts'),cacheDir:resolve(root,'node_modules/.vite-auth-app-entry'),server:{host:'127.0.0.1',port:5292,strictPort:true},
  optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react','@capacitor/core','react-native-reanimated','react-native-worklets','@supabase/supabase-js']},
  plugins:[{name:'local-auth-entry',enforce:'pre',resolveId(id,importer){if(id==='virtual:auth-app-entry')return '\0auth-app-entry';if(id.endsWith('/auth/SignupSms'))return '\0signup-confirm-stub';if(id==='./cloud'&&importer?.endsWith('/src/Screens.tsx'))return '\0auth-options-stub';},
    async load(id){if(id==='\0auth-app-entry')return(await transformWithEsbuild(fixture,'auth-fixture.tsx',{loader:'tsx',jsx:'automatic'})).code;if(id==='\0signup-confirm-stub')return 'export async function confirmSignupSms(email){window.__sms.push(email);return {phoneProof:"local-test-proof",deviceId:"local-test-device"}}';if(id==='\0auth-options-stub')return 'export const phoneOtpEnabled = new URLSearchParams(location.search).has("phone");';},
    configureServer(dev){dev.middlewares.use(async(req,res,next)=>{if(req.url?.startsWith('/__auth-app-entry')){res.setHeader('Content-Type','text/html');res.end(await dev.transformIndexHtml('/__auth-app-entry','<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/@id/__x00__auth-app-entry"></script></body></html>'));return;}next();});}}]});
await server.listen();let browser;const errors=[];
try{browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 await page.goto('http://127.0.0.1:5292/__auth-app-entry',{waitUntil:'domcontentloaded',timeout:60000});await page.locator('input[name=email]').waitFor();await page.waitForTimeout(800);
 for(const width of [320,390,430,1024]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('input[name=email]').evaluate(el=>getComputedStyle(el).fontSize),'16px');assert.equal(await page.locator('input[name=email]').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px','group rows must not retain boxed web inputs');}
 async function measureEntry(name, submitSelector='.nf-auth-panel .f-primary') {
   await page.setViewportSize({width:375,height:667});
   await page.evaluate(() => {
     document.documentElement.style.setProperty('--nf-native-safe-top','20px');
     document.documentElement.style.setProperty('--nf-native-safe-bottom','16px');
     window.scrollTo(0,0);
   });
   const size = await page.evaluate(selector => ({
     page: document.documentElement.scrollHeight,
     action: Math.ceil(document.querySelector(selector).getBoundingClientRect().bottom),
     viewport: innerHeight,
     requiredHeight: Math.max(...[...document.querySelectorAll('.nf-auth-frame input:not([type=checkbox]), .nf-auth-frame button')].filter(el=>el.getBoundingClientRect().height>0).map(el=>el.getBoundingClientRect().bottom)),
   }),submitSelector);
   console.log(name, size);
   assert.ok(size.page<=size.viewport+1 && size.requiredHeight<=size.viewport-15,name+' must fit above the safe area at 375×667');
   await page.screenshot({path:resolve(output,name+'-375.png'),animations:'disabled'});
   await page.setViewportSize({width:390,height:844});
 }
 await measureEntry('credentials');
 await page.screenshot({path:resolve(output,'credentials-390.png'),fullPage:true});
 await page.getByRole('button',{name:'متابعة',exact:true}).click();assert.equal(await page.locator('[data-entry-step=credentials]').count(),1,'empty credentials cannot progress');
 await page.locator('input[name=email]').fill('qa@example.com');await page.locator('input[name=password]').fill('local-password-12');await page.getByRole('button',{name:'متابعة',exact:true}).click();
 await page.locator('[data-entry-step=consent]').waitFor();assert.equal(await page.locator('input[type=checkbox]:checked').count(),0);assert.equal(await page.locator('input[name=email]').count(),0);
 assert.deepEqual(await page.evaluate(()=>window.__sms),[],'credential step cannot send SMS');assert.deepEqual(await page.evaluate(()=>window.__submitted),[],'credential step cannot create account');
 const create=page.getByRole('button',{name:'إنشاء الحساب',exact:true});assert.equal(await create.isDisabled(),true);await measureEntry('consent');await page.screenshot({path:resolve(output,'consent-390.png'),fullPage:true});
 await page.getByRole('button',{name:'قراءة شروط الاستخدام وإشعار الخصوصية',exact:true}).click();assert.equal(await page.evaluate(()=>window.__privacy),1);
 const choices=page.locator('input[type=checkbox]');assert.equal(await choices.nth(0).evaluate(el=>getComputedStyle(el).appearance),'none');await choices.nth(0).check();assert.equal(await choices.nth(0).evaluate(el=>getComputedStyle(el,'::after').content),'""');await choices.nth(1).check();assert.equal(await create.isDisabled(),true);await choices.nth(2).check();assert.equal(await create.isDisabled(),false);
 await page.getByRole('button',{name:'رجوع',exact:true}).click();assert.equal(await page.locator('input[name=email]').inputValue(),'qa@example.com');assert.equal(await page.locator('input[name=password]').inputValue(),'local-password-12');assert.equal(await page.evaluate(()=>window.__back),0);
 await page.getByRole('button',{name:'متابعة',exact:true}).click();await create.click();await page.waitForFunction(()=>window.__submitted.length===1);
 const submitted=await page.evaluate(()=>window.__submitted[0]);assert.equal(submitted[0],'qa@example.com');assert.equal(submitted[2].adult,true);assert.equal(submitted[2].terms,true);assert.equal(submitted[2].privacy,true);assert.ok(submitted[2].version);assert.equal(submitted[3].phoneProof,'local-test-proof');
 await page.getByRole('button',{name:'لدي حساب بالفعل',exact:true}).click();await measureEntry('login');await page.getByRole('button',{name:'تسجيل الدخول',exact:true}).click();await page.waitForFunction(()=>window.__submitted.length===2);assert.equal(await page.evaluate(()=>window.__sms.length),1,'login does not use signup phone confirmation');
 const base='http://127.0.0.1:5292/__auth-app-entry';
 await page.goto(base+'?native&login&phone');
 const apple=page.getByRole('button',{name:'المتابعة باستخدام Apple'}), google=page.getByRole('button',{name:'المتابعة باستخدام Google'});
 await apple.waitFor();await measureEntry('native-login','.nf-social-login button');
 await apple.click();await google.click();assert.deepEqual(await page.evaluate(()=>window.__social),['apple','google']);
 await page.getByRole('button',{name:'المتابعة بالبريد الإلكتروني'}).click();
 assert.equal(await apple.count(),0);await measureEntry('native-email');
 await page.getByRole('button',{name:'خيارات الدخول الأخرى'}).click();
 await page.getByRole('button',{name:'استخدام رقم الجوال'}).click();
 assert.equal(await apple.count(),0);await page.locator('input[type=tel]').waitFor();await measureEntry('phone');
 await page.getByRole('button',{name:'استخدام البريد الإلكتروني'}).click();await page.locator('input[name=email]').waitFor();
 assert.equal(await page.locator('h1').evaluate(el=>el===document.activeElement),true);
 await page.goto(base+'?native');await apple.waitFor();await measureEntry('native-signup','.nf-social-login button');
 const brief=page.locator('.nf-auth-brief');await brief.locator('summary').click();await brief.getByText(/بعد القبول/).waitFor();await brief.locator('summary').click();
 await page.getByRole('button',{name:'المتابعة بالبريد الإلكتروني'}).click();
 await page.setViewportSize({width:320,height:568});
 await page.evaluate(()=>{document.documentElement.dataset.nfText='large'});
 await page.locator('input[name=email]').fill('test@example.test');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.ok(await page.locator('input[name=email]').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>16));
 await page.locator('input[name=password]').fill('local-password-12');
 await page.getByRole('button',{name:'متابعة',exact:true}).click();
 await page.locator('[data-entry-step=consent]').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('input[type=checkbox]').last().check();
 await create.scrollIntoViewIfNeeded();
 assert.ok(await create.evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight),'large-type consent remains reachable');
 const pendingSizes=[];
 for (const [width,height,top,bottom] of [[375,667,20,16],[390,844,47,34]]) {
   await page.setViewportSize({width,height});
   await page.goto(base+'?native&pending');
   const status=page.locator('.nf-signup-status');
   await status.getByRole('heading',{name:'طلبك قيد المراجعة'}).waitFor();
   await page.evaluate(async ([top,bottom])=>{
     document.documentElement.style.setProperty('--nf-native-safe-top',top+'px');
     document.documentElement.style.setProperty('--nf-native-safe-bottom',bottom+'px');
     await document.fonts.ready;
   },[top,bottom]);
   assert.equal(await status.locator('[aria-current=step]').innerText(),'نراجع الملف');
   const guidance=status.locator('details').filter({has:page.locator('summary',{hasText:'ماذا يحدث بعد المراجعة'})});
   const support=status.locator('details').filter({has:page.locator('summary',{hasText:'تواصل مع فريق'})});
   const summary=guidance.locator('summary');
   assert.equal(await guidance.evaluate(el=>el.open),false);
   assert.equal(await support.evaluate(el=>el.open),false);
   const refresh=status.getByRole('button',{name:'تحديث حالة الطلب'});
   const size=await refresh.evaluate(el=>({
     viewport:[innerWidth,innerHeight],page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
     refreshBottom:Math.ceil(el.getBoundingClientRect().bottom),refreshHeight:el.getBoundingClientRect().height
   }));
   pendingSizes.push({...size,safeBottom:bottom});
   console.log('submitted-'+width,size);
   await page.screenshot({path:resolve(output,'submitted-'+width+'.png'),animations:'disabled'});
   await summary.click();
   assert.equal(await guidance.evaluate(el=>el.open),true);
   await guidance.getByText(/يمكنك الاستكشاف مجانًا/).waitFor();
   await guidance.getByText(/سؤال الفريق/).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   await page.screenshot({path:resolve(output,'submitted-help-'+width+'.png'),animations:'disabled'});
   await summary.click();
   const supportSummary=support.locator('summary');
   await supportSummary.click();
   await support.getByRole('button',{name:'المساعدة وطلباتي'}).waitFor();
   await support.getByRole('link',{name:/مراسلة فريق/}).waitFor();
   await support.getByRole('button',{name:'نسخ عنوان البريد'}).scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   await page.screenshot({path:resolve(output,'submitted-support-'+width+'.png'),animations:'disabled',fullPage:true});
   await supportSummary.click();
   await refresh.click();
   const waiting=status.getByRole('button',{name:'جارٍ تحديث الحالة…'});
   await waiting.waitFor(); assert.equal(await waiting.isDisabled(),true);
   assert.equal(await page.evaluate(()=>window.__refreshes),1);
   await page.evaluate(()=>window.__finishRefresh());
   await refresh.waitFor(); assert.equal(await refresh.isEnabled(),true);
 }
 for (const size of pendingSizes) {
   assert.deepEqual(size.page,size.viewport,'submitted application should fit the default viewport');
   assert.ok(size.refreshBottom<=size.viewport[1]-size.safeBottom && size.refreshHeight>=44,'refresh is reachable above the home indicator');
 }
 assert.deepEqual(errors,[]);console.log('Passed: responsive account entry, required credentials, consent, SMS handoff, login, submitted status, progress disclosure and refresh.');
}finally{await browser?.close();await server.close();}
