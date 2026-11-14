import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE||'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output=resolve('.tmp/request-family');await mkdir(output,{recursive:true});
const server=await createServer({optimizeDeps:{entries:['tests/fixtures/agreement-qa.html','tests/fixtures/family-bridge-qa.html']},server:{host:'127.0.0.1',port:5285,strictPort:true}});await server.listen();
let browser;const errors=[],external=[];
try {
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 page.setDefaultTimeout(60000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const url=new URL(r.request().url());if(url.hostname==='127.0.0.1'||['blob:','data:'].includes(url.protocol))return r.continue();external.push(url.origin);return r.abort();});
 const go=async path=>{console.log('Checking',path);await page.goto('http://127.0.0.1:5285/tests/fixtures/'+path,{waitUntil:'domcontentloaded',timeout:60000});};
 for(const width of [390,320]) {
  await page.setViewportSize({width,height:844});
  await go('agreement-qa.html');
  await page.locator('.cm-timeline-choices button[aria-pressed=true]').waitFor();
  assert.match(await page.locator('.cm-timeline-choices button[aria-pressed=true]').innerText(),/30|٣٠/);
  const sign=page.getByRole('button',{name:'تحديث اقتراح المدة'});
  assert(await sign.isDisabled());
  await page.getByRole('checkbox').check();await sign.click();
  await page.getByRole('status').filter({hasText:'اقترحتِ 30'}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:resolve(output,`agreement-${width}.png`),fullPage:true});
  await go('agreement-qa.html?man');await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'التوقيع والموافقة وبدء الحديث'}).click();
  await page.getByText('المحادثة متاحة',{exact:true}).waitFor();
  await go('agreement-qa.html?expired');
  await page.getByRole('button',{name:'اقتراح أسبوع إضافي'}).click();
  await page.getByText('اقتراح التمديد بانتظار الطرف الآخر.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'إنهاء التعارف باحترام'}).click();
  await page.getByText('فتح تأكيد إنهاء التعارف',{exact:true}).waitFor();
  await go('family-bridge-qa.html?pending&deepLink&linked');
  await page.getByText('بانتظار موافقتك على المشاركين',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'fb-room-synthetic-active-room');
  assert.equal(await page.getByText('هذه المساحة لم تعد متاحة لك.',{exact:false}).count(),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.waitForTimeout(500);
  await page.screenshot({path:resolve(output,`family-invitation-${width}.png`)});
  await page.getByRole('button',{name:'أوافق على المشاركين'}).click();
  await page.getByRole('button',{name:'فتح المحادثة',exact:true}).click();
  await page.locator('.fb-chat').waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.waitForTimeout(500);
  await page.screenshot({path:resolve(output,`family-chat-${width}.png`)});
 }
 await go('agreement-qa.html');await page.locator('.cm-agreement').waitFor();
 for(const mode of ['os','app']) {
  await page.emulateMedia({reducedMotion:mode==='os'?'reduce':'no-preference'});
  if(mode==='app')await page.evaluate(()=>document.documentElement.dataset.nfMotion='reduced');
  assert.equal(await page.locator('.cm-agreement').evaluate(e=>getComputedStyle(e).animationName),'none');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS: 390/320px proposal duration, explicit signature, accepted agreement, expired extension and exit, pending room deep link/focus, participant approval and separate family chat, OS/app reduced motion; zero external requests.');
}finally{await browser?.close();await server.close();}
