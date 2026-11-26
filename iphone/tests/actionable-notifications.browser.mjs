import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const {chromium}=createRequire(import.meta.url)(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
await mkdir('.tmp/actionable-notifications',{recursive:true});
const server=await createServer({optimizeDeps:{entries:['tests/fixtures/profile-qa.html']},
  cacheDir:'node_modules/.vite-actionable-notifications',server:{host:'127.0.0.1',port:0,hmr:false}});
await server.listen();
let browser, diagnosticPage;
try {
  browser=await chromium.launch({headless:true,channel:'chrome'});
  for(const [actor,peer,event,title,setup] of [
    ['abdulrahman','رهام','agreement:proposed','ميثاق التعارف بانتظار توقيعك','useProposal'],
    ['reham','عبدالرحمن','agreement:extension','لديك طلب لتمديد مدة التعارف','useExtension'],
  ]) {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage(), errors=[];
    diagnosticPage=page;
    page.setDefaultTimeout(35000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    const url=new URL('tests/fixtures/profile-qa.html?alerts&actor='+actor,server.resolvedUrls.local[0]).href;
    await page.goto(url,{waitUntil:'commit',timeout:90000});
    await page.getByRole('button',{name:'تخطّي الجولة'}).click({timeout:60000});
    const alertsTab=()=>page.getByRole('button',{name:'الإشعارات',exact:true}).click();
    assert.equal(await page.locator('.nf-activity-toast, .nf-match[open]').count(),0);
    await alertsTab();
    await page.locator('.cm-notification-row').filter({hasText:'تم قبول طلب التعارف'}).click();
    await page.locator('.cm-chat-head').getByRole('heading',{name:peer}).waitFor();
    await page.locator('.cm-agreement[data-agreement-status=none]').waitFor();
    await page.getByRole('button',{name:'العودة للمحادثات'}).click();
    const id='c0000000-0000-4000-8000-00000000000'+(actor==='reham'?'2':'1');
    await page.evaluate(({event,id,setup})=>{
      window.qaAlerts[setup]();
      window.qaAlerts.add(event,id);
      window.qaAlerts.add('agreement:extended','c0000000-0000-4000-8000-000000000009');
    },{event,id,setup});
    assert.equal(await page.locator('.nf-activity-toast, .nf-match[open]').count(),0);
    assert.equal(await page.getByText(title,{exact:true}).count(),0);
    await alertsTab();
    const row=page.locator('.cm-notification-row').filter({hasText:title});
    await row.waitFor();
    await row.screenshot({path:'.tmp/actionable-notifications/'+actor+'.png'});
    await row.click();
    await page.locator('.cm-chat-head').getByRole('heading',{name:peer}).waitFor();
    const act=page.getByRole('button',{name:actor==='reham'?'الموافقة على التمديد':'التوقيع والموافقة وبدء الحديث'});
    await act.waitFor();
    if(actor==='abdulrahman')await page.getByRole('checkbox',{name:/قرأت شروط الميثاق/}).check();
    await act.click();
    await page.locator('.cm-agreement-summary').waitFor();
    await page.waitForFunction(id=>window.qaAlerts.read(id),id);
    assert.deepEqual(errors,[]);
    await page.getByRole('button',{name:'العودة للمحادثات'}).click();
    await alertsTab();
    await page.locator('.cm-notification-row[data-unread=true]').filter({hasText:'تم تمديد مدة التعارف'}).waitFor();
    const room='c0000000-0000-4000-8000-000000000055';
    const roomEvent=actor==='reham'?'family_room:active':'family_room:invited';
    const roomTitle=actor==='reham'?'محادثتكما العائلية جاهزة':'مساحة عائلية بانتظار موافقتك';
    await page.evaluate(({room,roomEvent})=>window.qaAlerts.add(roomEvent,'c0000000-0000-4000-8000-000000000099',room),{room,roomEvent});
    await page.locator('.cm-notification-row').filter({hasText:roomTitle}).click({timeout:30000});
    if(actor==='reham'){
      await page.getByRole('heading',{name:'موعد اللقاء العائلي',exact:true}).waitFor();
      await page.locator('.fb-chat textarea').waitFor();
    }
    else {
      await page.waitForFunction(id=>document.activeElement?.id==='fb-room-'+id,room);
      await page.locator('#fb-room-'+room).getByRole('button',{name:'أوافق على المشاركين'}).click();
      await page.locator('#fb-room-'+room).getByText('بانتظار بقية الموافقات').waitFor();
    }
    await context.close();
    console.log(actor+': feed-only match, agreement and family-room links passed.');
  }
  const profilePage=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
  diagnosticPage=profilePage;
  for(const state of ['unmatched','pending','accepted']){
    await profilePage.goto(new URL('tests/fixtures/profile-qa.html?profileConnection='+state,server.resolvedUrls.local[0]).href,{waitUntil:'commit'});
    await profilePage.locator('.mp-profile h1').waitFor();
    const entry=profilePage.getByRole('button',{name:/تحليل وُدَين المعمّق/});
    if(state==='accepted')await entry.waitFor();
    else assert.equal(await entry.count(),0,state+' discovery profile');
  }
  console.log('Deep analysis appears only after matching.');
} catch(error) {
  if(diagnosticPage){
    console.log((await diagnosticPage.locator('body').innerText().catch(()=>'' )).slice(0,800));
    await diagnosticPage.screenshot({path:'.tmp/actionable-notifications/failure.png'}).catch(()=>{});
  }
  throw error;
} finally {await browser?.close();await server.close();}
