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
 async function openPactDetails() {
  await page.getByRole('button',{name:'خيارات المحادثة'}).click();
  await page.getByRole('button',{name:'ميثاق التعارف',exact:true}).click();
 }
 async function open(actor,query='agreement') {
  await page.goto('http://127.0.0.1:5297/tests/fixtures/chat-privacy-qa.html?'+query+'&actor='+actor+'&case='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByRole('button',{name:/فتح المحادثة مع/}).click();
  await page.locator('.cm-chat-stage').waitFor();
  await page.evaluate(()=>document.fonts.ready);
 }
 for(const actor of ['reham','abdulrahman']) {
  await page.setViewportSize({width:390,height:844});
  await open(actor);
  const imprint=page.locator('.cm-agreement-slot .cm-agreement');
  await imprint.waitFor();
  assert.match(await imprint.locator('.cm-agreement-next').innerText(),/التعارف الحصري[\s\S]*أنتم الاثنين[\s\S]*تُغلق المحادثات والطلبات الأخرى/);
  assert.equal(await page.getByRole('dialog').count(),0);
  assert(await page.getByRole('button',{name:'إرسال الرسالة',exact:true}).isDisabled());
  await page.screenshot({path:resolve(output,actor+'-390.png'),animations:'disabled'});
  await page.setViewportSize({width:320,height:667});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:resolve(output,actor+'-320.png'),animations:'disabled'});
  assert.equal(await page.locator('.cm-agreement').count(),1);
  assert.equal(await page.locator('.cm-chat-log').isVisible(),false);
  const checkbox=imprint.getByRole('checkbox');
  await checkbox.tap();
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  assert(await checkbox.isChecked());
  assert.equal(await page.locator('.cm-agreement').count(),1);
  await imprint.locator('.cm-agreement-sign span').tap();
  assert.equal(await checkbox.isChecked(),false);
  await imprint.locator('.cm-agreement-sign span').tap();
  assert(await checkbox.isChecked());
  await imprint.getByRole('button',{name:actor==='reham'?'التوقيع واقتراح المدة':'التوقيع والموافقة وبدء الحديث'}).click();
  const signature=page.locator('.cm-agreement-slot .cm-ink-receipt');
  await signature.waitFor();
  assert.equal(await signature.locator('bdi').textContent(),actor==='reham'?'نورة':'عبدالله');
  if(actor==='reham') {
   await page.getByRole('button',{name:'مراجعة اقتراحك'}).waitFor();
   assert.equal(await imprint.count(),0);
   await page.getByRole('button',{name:'مراجعة اقتراحك'}).click();
   await page.locator('.cm-agreement-slot .cm-agreement-inline').waitFor();
   await page.getByRole('button',{name:'إغلاق تفاصيل الاتفاق'}).click();
  } else {
   await page.locator('.cm-first-message').getByRole('button',{name:'اسأل عن هالنقطة'}).click();
   assert.match(await page.getByRole('textbox',{name:'رسالتك'}).inputValue(),/ودي يبقى لنا وقت نطبخ فيه سوا/);
   assert.equal(await page.locator('.cm-message-row').count(),0);
   assert.equal(await imprint.count(),0);
   await openPactDetails();
   await page.locator('.cm-agreement-slot .cm-agreement-inline').waitFor();
   assert.equal(await page.getByRole('dialog').count(),0);
  }
 }
 await page.setViewportSize({width:390,height:844});
 await open('abdulrahman','renew');
 const notice=page.locator('.cm-agreement-notice');
 const top=await notice.evaluate(node=>node.getBoundingClientRect().top);
 await page.locator('.cm-chat-log').evaluate(log=>{log.scrollTop=log.scrollHeight;});
 assert.equal(await notice.evaluate(node=>node.getBoundingClientRect().top),top);
 await page.getByRole('button',{name:'اختيار الخطوة التالية'}).click();
 const expired=page.locator('.cm-agreement-slot .cm-agreement-inline');
 await expired.getByRole('button',{name:'مراجعة التعارف الحصري'}).waitFor();
 await expired.getByRole('button',{name:'إنهاء التعارف باحترام'}).waitFor();
 await page.screenshot({path:resolve(output,'expired-390.png'),animations:'disabled'});
 await page.getByRole('button',{name:'إغلاق تفاصيل الاتفاق'}).click();
 await page.locator('[data-server-id="hello"]').waitFor();
 for(const actor of ['reham','abdulrahman']){
  await open(actor,'renew&exclusive&familyStage');
  await openPactDetails();
  const details=page.locator('.cm-agreement-inline');
  await details.getByText('اتفقتما على التواصل مع الأهل',{exact:true}).waitFor();
  assert.equal(await details.getByRole('button',{name:'اقتراح التواصل العائلي'}).count(),0);
  assert.equal(await details.getByRole('button',{name:'مشاركة رقم الأهل'}).count(),actor==='reham'?1:0);
  assert.equal(await page.locator('a[href^="tel:"]').count(),0);
 }
 await open('abdulrahman','renew&exclusive&familyStage&sharedFamilyNumber');
 await openPactDetails();
 const sharedDetails=page.locator('.cm-agreement-inline');
 assert.equal(await sharedDetails.getByRole('button',{name:'اقتراح التواصل العائلي'}).count(),0);
 assert.equal(await page.locator('a[href^="tel:"]').count(),0);
 await sharedDetails.getByRole('button',{name:'عرض رقم الأهل'}).click();
 await sharedDetails.locator('a[href="tel:+966500000001"]').waitFor();
 await sharedDetails.getByRole('button',{name:'إخفاء الرقم'}).click();
 await page.screenshot({path:resolve(output,'family-confirmed-390.png'),animations:'disabled'});
 await open('reham','renew&familyStage&pendingFamily');
 await page.getByRole('button',{name:'اختيار الخطوة التالية'}).click();
 await page.locator('.cm-agreement-inline summary').click();
 await page.getByRole('button',{name:'إلغاء طلب الميثاق السابق'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'الموافقة على التواصل العائلي'}).count(),0);
 await open('reham','exclusive&sharedFamilyNumber');
 await openPactDetails();
 await page.getByRole('button',{name:'اقتراح التواصل العائلي'}).waitFor();
 assert.equal(await page.locator('a[href^="tel:"]').count(),0);
 await open('abdulrahman','stalledAgreement');
 await page.locator('.cm-agreement-slot').getByRole('status',{name:'جارٍ تحميل ميثاق التعارف'}).waitFor();
 assert.equal(await page.locator('.cm-chat-plan .cm-agreement-pending').count(),0);
 assert.doesNotMatch(await page.locator('body').innerText(),/جارٍ تحضير اتفاقكما/);
 assert.deepEqual(errors,[]);
 console.log('PASS: inline agreement, both roles, 390/320px, explicit signature, pending/accepted collapse, inline review, expiry decisions and preserved chat history.');
} finally { await browser?.close();await server.close(); }
