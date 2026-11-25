import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE||'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output=resolve('.tmp/agreement-imprint');
await mkdir(output,{recursive:true});
const server=await createServer({optimizeDeps:{entries:['tests/fixtures/chat-privacy-qa.html']},server:{host:'127.0.0.1',port:5297,strictPort:true}});
await server.listen();
let browser;
const errors=[];
try {
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 async function open(actor,query='agreement') {
  await page.goto('http://127.0.0.1:5297/tests/fixtures/chat-privacy-qa.html?'+query+'&actor='+actor+'&case='+Date.now());
  await page.getByRole('button',{name:/فتح المحادثة مع/}).click();
  await page.locator('.cm-chat-log').waitFor();
  await page.evaluate(()=>document.fonts.ready);
 }
 for(const actor of ['reham','abdulrahman']) {
  await page.setViewportSize({width:390,height:844});
  await open(actor);
  const imprint=page.locator('.cm-chat-log .cm-agreement');
  await imprint.waitFor();
  assert.match(await imprint.innerText(),/مسار التعارف/);
  assert.equal(await page.getByRole('dialog').count(),0);
  assert(await page.getByRole('button',{name:'إرسال الرسالة',exact:true}).isDisabled());
  await page.screenshot({path:resolve(output,actor+'-390.png'),animations:'disabled'});
  await page.setViewportSize({width:320,height:667});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:resolve(output,actor+'-320.png'),animations:'disabled'});
  await imprint.getByRole('checkbox').check();
  await imprint.getByRole('button',{name:actor==='reham'?'التوقيع واقتراح المدة':'التوقيع والموافقة وبدء الحديث'}).click();
  if(actor==='reham') {
   await page.getByRole('button',{name:'مراجعة اقتراحك'}).waitFor();
   assert.equal(await imprint.count(),0);
   await page.getByRole('button',{name:'مراجعة اقتراحك'}).click();
   await page.locator('.cm-chat-log .cm-agreement-inline').waitFor();
   await page.getByRole('button',{name:'إغلاق تفاصيل الاتفاق'}).click();
  } else {
   await page.getByRole('heading',{name:'كل بداية، حديث'}).waitFor();
   assert.equal(await imprint.count(),0);
   await page.getByRole('button',{name:/تفاصيل اتفاقكما حتى/}).click();
   await page.locator('.cm-chat-log .cm-agreement-inline').waitFor();
   assert.equal(await page.getByRole('dialog').count(),0);
  }
 }
 await page.setViewportSize({width:390,height:844});
 await open('abdulrahman','renew');
 await page.getByRole('button',{name:'اختيار الخطوة التالية'}).click();
 const expired=page.locator('.cm-chat-log .cm-agreement-inline');
 await expired.getByRole('button',{name:'مراجعة الخطوة التالية في المسار'}).waitFor();
 await expired.getByRole('button',{name:'إنهاء التعارف باحترام'}).waitFor();
 await page.screenshot({path:resolve(output,'expired-390.png'),animations:'disabled'});
 await page.getByRole('button',{name:'إغلاق تفاصيل الاتفاق'}).click();
 await page.locator('[data-server-id="hello"]').waitFor();
 await open('abdulrahman','stalledAgreement');
 await page.locator('.cm-chat-log').getByRole('status',{name:'جارٍ تحميل ميثاق التعارف'}).waitFor();
 assert.equal(await page.locator('.cm-chat-plan .cm-agreement-pending').count(),0);
 assert.doesNotMatch(await page.locator('body').innerText(),/جارٍ تحضير اتفاقكما/);
 assert.deepEqual(errors,[]);
 console.log('PASS: inline agreement, both roles, 390/320px, explicit signature, pending/accepted collapse, inline review, expiry decisions and preserved chat history.');
} finally { await browser?.close();await server.close(); }
