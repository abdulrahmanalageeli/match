import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);const {chromium}=require('C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output=resolve('.tmp/settings-pass2');await mkdir(output,{recursive:true});
const server=await createServer({optimizeDeps:{entries:['tests/fixtures/settings-qa.html']},server:{host:'127.0.0.1',port:5286,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[],external=[];page.setDefaultTimeout(60000);
page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='127.0.0.1'||['data:','blob:'].includes(u.protocol))return r.continue();external.push(u.origin);return r.abort();});
try {
 const memberOnly=process.argv.includes('--member-only');
 if(!memberOnly){
 for(const width of [390,320]){
 await page.setViewportSize({width,height:844});await page.goto('http://127.0.0.1:5286/tests/fixtures/settings-qa.html');await page.locator('.st-member-card').waitFor();
 assert.equal(await page.getByText(/لونا|Luna/i).count(),0);
 assert(await page.getByText('ملفك متاح للترشيحات',{exact:true}).isVisible());
 for(const [group,control] of [['المساعدة والدعم','دليلك في وُدَين'],['الحساب','تسجيل الخروج']]){
   const fold=page.getByText(group,{exact:true});
   await fold.click();assert(await page.getByRole('button',{name:new RegExp(control)}).isVisible());await fold.click();
 }
 if(width===320){await page.emulateMedia({colorScheme:'dark'});const display=page.getByText('العرض والصوت',{exact:true});await display.click();await page.getByRole('switch',{name:'تكبير النص',exact:true}).click();await page.getByRole('switch',{name:'تقليل الحركة',exact:true}).click();await display.click();}
 async function capture(name){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(700);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');await page.screenshot({path:resolve(output,`${name}-${width}.png`),fullPage:true});}
 await capture('settings');
 const actionInsets = await page.locator('.st-member-actions').evaluate(rail => {
   const bounds = rail.getBoundingClientRect();
   return Array.from(rail.querySelectorAll('button'), button => {
     const box = button.getBoundingClientRect();
     return { top: box.top - bounds.top, bottom: bounds.bottom - box.bottom, height: box.height };
   });
 });
 assert.equal(actionInsets.length, 3);
 for (const {top, bottom, height} of actionInsets) {
   assert(top > 1 && Math.abs(top - bottom) < 1, `Settings action insets at ${width}px: ${top}px top, ${bottom}px bottom`);
   assert(height >= 44, `Settings action tap height at ${width}px: ${height}px`);
 }
 await page.getByRole('button',{name:/عضويتي/}).click();await capture('membership');await page.getByRole('button',{name:'العودة للتجربة',exact:true}).click();
 await page.getByText('الخصوصية والبيانات',{exact:true}).click();
 await page.getByRole('button',{name:/الخصوصية وشروط العضوية/}).click();await capture('policy');await page.locator('.flow-header .f-icon').click();
 await page.getByText('الخصوصية والبيانات',{exact:true}).click();
 await page.getByRole('button',{name:/خصوصية بيانات الملف/}).click();await capture('data-privacy');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/إيقاف الترشيحات مؤقتًا/}).click();await capture('pause-confirm');await page.getByRole('button',{name:'تراجع',exact:true}).click();
 await page.getByRole('button',{name:'عرض ملفي كما يراه الآخرون',exact:true}).click();await page.locator('.mp-profile').waitFor();await capture('own-profile');await page.locator('.mp-back').click();
  await page.locator('.st-member-photos').click();await page.locator('.pg-open').waitFor();await capture('gallery');await page.locator('.pg-open').click();await page.locator('.pg-lightbox[open]').waitFor();await capture('lightbox');assert(await page.locator('.pg-close').evaluate(e=>e.getBoundingClientRect().height>=44));await page.keyboard.press('Escape');await page.locator('.pg-lightbox:not([open])').waitFor({state:'attached'});await page.locator('.pg-remove').click();await capture('photo-confirm');await page.getByRole('button',{name:'تراجع',exact:true}).click();await page.locator('.mp-back').click();
 for(const [entry,screen,name] of [['.st-family-entry button','.fb-screen','family'],['.st-readiness-entry button','.rp-screen','passport']]){const marriage=page.locator('details.st-hub').filter({hasText:'رحلتي وأدوات الزواج'});if(!(await marriage.evaluate(e=>e.open)))await marriage.locator('summary').click();await page.locator(entry).click();await page.locator(screen).waitFor();await page.waitForTimeout(250);await capture(name);if(width===320)assert.equal(await page.locator(name==='family'?'.fb-hero':'.rp-cover').evaluate(e=>getComputedStyle(e).animationName),'none');await page.locator(screen+' header button').first().click();assert(await page.locator(entry).evaluate(e=>document.activeElement===e),'back focus');}
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>document.documentElement.dataset.nfMotion='system');{const marriage=page.locator('details.st-hub').filter({hasText:'رحلتي وأدوات الزواج'});if(!(await marriage.evaluate(e=>e.open)))await marriage.locator('summary').click();}await page.locator('.st-family-entry button').click();assert.equal(await page.locator('.fb-hero').evaluate(e=>getComputedStyle(e).animationName),'none');
 }
 // Only this fixture page replaces the Apple/account and device responses with local examples.
 const memberContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const memberPage=await memberContext.newPage();
 memberPage.setDefaultTimeout(60000);memberPage.on('pageerror',e=>errors.push(e.message));
 await memberPage.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='127.0.0.1'||['data:','blob:'].includes(u.protocol))return r.continue();external.push(u.origin);return r.abort();});
 await memberPage.route(/\/src\/cloud\.ts(?:\?.*)?$/,r=>{
   if(r.request().url().includes('qa-original'))return r.continue();
   return r.fulfill({contentType:'application/javascript',body:`
     export * from '/src/cloud.ts?qa-original';
     export async function callRpc(name,payload,owner) {
       if(owner!=='qa-member')throw Error('Unexpected fixture owner');
       if(name!=='marriage_my_settings')throw Error('Unexpected fixture RPC');
       return {visibility:'review',approvedPreview:{id:owner,alias:'الاسم المعتمد',age:28,city:'الرياض',bio:'نبذة معتمدة',occupation:'',interests:[],reasons:[]},
         subscriptions:[{freeTrial:true,endsAt:'2099-01-08T12:00:00Z',autoRenew:true,billingRetry:false,
           renewalDate:'2099-01-08T12:00:00Z',milliunits:99990,currency:'SAR'}]};
     }`});
 });
 await page.route(/\/src\/notifications\/push\.ts(?:\?.*)?$/,r=>r.fulfill({contentType:'application/javascript',body:`
   export const defaultPushControls={},pushControls=async()=>null; export const nativePush=true,pushConfigured=true,pushSupported=()=>true,pushStatus=async()=>({permission:'granted'}),
     getPushPreference=async()=>({enabled:true}),enablePush=async()=>({enabled:true}),disablePush=async()=>({enabled:false}),
     openPushSettings=async()=>{},setPushBadge=async()=>{},usePushNotifications=()=>{};
   let mode='private';export async function pushPrivacy(owner,newMode){mode=newMode??mode;return {preview:mode};}
 `}));
 await memberPage.route(/\/src\/notifications\/push\.ts(?:\?.*)?$/,r=>r.fulfill({contentType:'application/javascript',body:[
   "export const defaultPushControls={},pushControls=async()=>null;",
   "export const nativePush=true,pushConfigured=true,pushSupported=()=>true,pushStatus=async()=>({permission:'granted'});",
   "export const getPushPreference=async()=>({enabled:true}),enablePush=async()=>({enabled:true}),disablePush=async()=>({enabled:false});",
   "export const openPushSettings=async()=>{},setPushBadge=async()=>{},usePushNotifications=()=>{};",
   "export const pushDeviceRegistered=async()=>true,registerPushDevice=async()=>{};",
   "let mode='private';export async function pushPrivacy(owner,newMode){mode=newMode??mode;return {preview:mode};}"
 ].join('\n')}));
 await memberPage.goto('http://127.0.0.1:5286/tests/fixtures/settings-qa.html?member');
 await memberPage.getByText('يظهر ملفك في الترشيحات بعد اعتماده',{exact:true}).waitFor();
 assert.equal(await memberPage.locator('.st-screen').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(253, 253, 253)');
 const charge=await memberPage.locator('.st-membership-billing').innerText();
 assert(charge.includes('تنتهي تجربتك المجانية'));assert(charge.includes(new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR'}).format(99.99).trim()));
 await memberPage.getByText('الإشعارات',{exact:true}).click();
 const select=memberPage.getByRole('combobox',{name:'معاينة الإشعارات'}), sample=memberPage.locator('.st-lock-preview');
 await sample.getByText('إشعار جديد').waitFor();assert(!(await sample.innerText()).includes('نورة'));
 await select.selectOption('name');await sample.getByText('رسالة من نورة').waitFor();assert(!(await sample.innerText()).includes('يسعدني'));
 await select.selectOption('content');await sample.getByText('يسعدني أن نتعرّف أكثر.').waitFor();
 await memberPage.getByRole('button',{name:'عرض ملفي كما يراه الآخرون'}).click();
 await memberPage.getByRole('heading',{name:/الاسم المعتمد/}).waitFor();assert.equal(await memberPage.getByText('مسودة للاختبار').count(),0);
 await memberPage.locator('.mp-back').click();await memberPage.locator('.st-member-photos').click();
 assert.equal(await memberPage.getByRole('button',{name:/إيقاف مشاركة الصورة/}).count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS: Settings at 390px and 320px, Arabic large text, light appearance with system dark mode, focus restoration, notification previews, approved profile, trial pricing and retired photo grant controls. Zero external requests.');
}finally{await browser.close();await server.close();}
