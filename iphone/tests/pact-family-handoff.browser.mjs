// Exercise both members' UI against a synthetic private handoff. PostgreSQL tests cover authorization.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const path='.tmp/pact-family-handoff';
await mkdir(path,{recursive:true});
const fixture=`
import {createElement as h} from 'react';import {createRoot} from 'react-dom/client';
import {PactDecisionSheet} from '/src/community/FamilyContact.tsx';import {RequestHistory} from '/src/community/RequestHistory.tsx';
import '/src/design.css';import '/src/flows.css';import '/src/screens.css';import '/src/community/community.css';import '/src/typography.css';
const query=new URLSearchParams(location.search), view=query.get('view'), gender=query.get('gender');
window.reads=0;window.__matchClosed=false;
const source={
  agreement:async()=>({actor:gender==='woman'?'reham':'abdulrahman',status:query.has('unsigned')?'pending':'expired',womanSignedAt:'2026-11-01',manSignedAt:query.has('unsigned')?null:'2026-11-01'}),
  act:async()=>{window.__matchClosed=true;},
  closeIntroduction:async(_id,choice)=>{window.__decision=choice;if(choice.familyPhone)localStorage.setItem('family',choice.familyPhone);window.__matchClosed=true;},
  shareFamilyContact:async(_id,phone,options)=>{localStorage.setItem('family',phone);window.__matchClosed=options.closeNow;},
  familyContact:async()=>{window.reads++;return localStorage.getItem('family');},
  watch:()=>()=>{},
  requestHistory:async()=>[{id:'match',alias:'نورة',direction:'incoming',outcome:'closed',resolution:'ended',hasFamilyContact:true}],
};
const root=createRoot(document.querySelector('#root'));
root.render(view==='history'?h(RequestHistory,{source}):h(PactDecisionSheet,{source,connection:{id:'match',person:{alias:'عبدالله'}},viewerGender:gender,initialContext:query.get('origin')||'general',mode:view,dismiss:()=>root.render(null),onClosed:()=>root.render(null)}));`;
const server=await createServer({mode:'demo',logLevel:'error',cacheDir:path+'/vite',server:{host:'127.0.0.1',port:0},plugins:[{
  name:'pact-contacts-fixture',
  resolveId(id){if(id==='virtual:pact-contacts')return '\0pact-contacts';},
  load(id){if(id==='\0pact-contacts')return fixture;},
  configureServer(dev){
    dev.middlewares.use('/pact-contacts',async(_req,res)=>{
      res.setHeader('Content-Type','text/html');
      res.end(await dev.transformIndexHtml('/pact-contacts','<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="phone-app" id="root"></div><script type="module" src="/@id/__x00__pact-contacts"></script></body></html>'));
    });
  },
}]});
let browser;
try{
  await server.listen();browser=await chromium.launch({channel:'chrome'});
  const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true,locale:'ar-SA'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function open(view,gender='woman',options={}){
    await page.goto(server.resolvedUrls.local[0]+'pact-contacts?'+new URLSearchParams({view,gender,...options}));
  }
  await open('share');
  const field=page.getByRole('textbox',{name:'رقم الوالد أو أحد من الأهل'});
  await field.fill('snap_0551234567');await page.getByRole('button',{name:'مشاركة رقم الأهل',exact:true}).click();
  await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('family')),null);
  await field.fill('٠١١ ٢٣٤ ٥٦٧٨');
  await page.getByRole('button',{name:'مشاركة رقم الأهل',exact:true}).click();
  await page.getByText('شاركتِ رقم الأهل مع عبدالله').waitFor();
  assert.equal(await page.evaluate(()=>window.__matchClosed),false);
  await open('close');
  assert.equal(await page.getByRole('radio',{name:'قرار شخصي'}).isChecked(),true);
  await page.getByRole('radio',{name:'إنهاء الميثاق'}).check();
  await page.getByRole('checkbox',{name:'إرفاق رقم الأهل للخطوة الرسمية'}).check();
  await field.fill('٠٥٥ ١٢٣ ٤٥٦٧');await page.evaluate(()=>document.fonts.ready);
  await field.blur();await page.screenshot({path:path+'/share-and-close.png'});
  await page.getByRole('button',{name:'مشاركة الرقم وإنهاء التعارف'}).click();
  await page.waitForFunction(()=>window.__matchClosed);
  assert.deepEqual(await page.evaluate(()=>window.__decision),{context:'pact',allowRematch:false,familyPhone:'+966551234567'});
  assert.equal(await page.evaluate(()=>localStorage.getItem('family')),'+966551234567');
  await open('history','man');
  await page.getByText('التعارفات السابقة',{exact:true}).click();await page.getByText('نورة',{exact:true}).click();
  assert.equal(await page.evaluate(()=>window.reads),0);assert.equal(await page.locator('a[href^="tel:"]').count(),0);
  await page.getByRole('button',{name:'عرض رقم الأهل'}).click();
  assert.equal(await page.getByRole('link',{name:/الاتصال بالأهل/}).getAttribute('href'),'tel:+966551234567');
  await page.getByRole('button',{name:'إخفاء الرقم'}).click();assert.equal(await page.locator('a[href^="tel:"]').count(),0);
  await open('close','man');await page.getByRole('button',{name:'تأكيد إنهاء التعارف'}).waitFor();
  assert.equal(await page.getByRole('checkbox',{name:'إرفاق رقم الأهل للخطوة الرسمية'}).count(),0);
  await page.getByRole('button',{name:'تأكيد إنهاء التعارف'}).click();await page.waitForFunction(()=>window.__matchClosed);
  assert.deepEqual(await page.evaluate(()=>window.__decision),{context:'general',allowRematch:false});
  await open('close','man',{origin:'pact'});
  assert.equal(await page.getByRole('radio',{name:'إنهاء الميثاق'}).isChecked(),true);
  await page.getByRole('checkbox',{name:/السماح بالتعارف/}).check();
  await page.getByRole('button',{name:'تأكيد إنهاء التعارف'}).click();await page.waitForFunction(()=>window.__matchClosed);
  assert.deepEqual(await page.evaluate(()=>window.__decision),{context:'pact',allowRematch:true});
  await open('close','woman',{origin:'pact'});
  await page.getByRole('radio',{name:'قرار شخصي'}).check();
  await page.getByRole('checkbox',{name:'إرفاق رقم الأهل للخطوة الرسمية'}).check();
  await field.fill('٠٥٥ ١٢٣ ٤٥٦٧');
  assert.equal(await field.inputValue(),'055 123 4567');
  await page.getByRole('button',{name:'مشاركة الرقم وإنهاء التعارف'}).click();await page.waitForFunction(()=>window.__matchClosed);
  assert.deepEqual(await page.evaluate(()=>window.__decision),{context:'general',allowRematch:false,familyPhone:'+966551234567'});
  await open('close','woman',{unsigned:'1'});
  await page.getByRole('button',{name:'تأكيد إنهاء التعارف'}).click();await page.waitForFunction(()=>window.__matchClosed);
  assert.equal(await page.evaluate(()=>window.__decision.context),'general');
  assert.deepEqual(errors,[]);console.log('PASS expiry share, reject handles, pact and general closure, unsigned closure, rematch choice, private recipient reveal and dial.');
}finally{await browser?.close();await server.close();}
