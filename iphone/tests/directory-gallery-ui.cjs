const {chromium}=require('C:/Users/timgo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const state={actor:'reham',matched:true,messages:[],read:{},delivered:{},profiles:{},stage:1,agree:{},exclusive:false,exclusiveConsent:{},call:null,seriousness:{status:'accepted',days:14,deadline:'2026-12-01T00:00:00Z'}};
 const gallery=[];
 await page.route('**/functions/v1/pair-test*',async route=>{
  const upload=route.request().url().includes('gallery_upload');const b=upload?{}:route.request().postDataJSON();let value={...state,session:'a'.repeat(64)};
  if(upload){gallery.push({id:String(gallery.length+1)});value={ok:true};}
  if(b.action==='gallery_list')value=gallery;
  if(b.action==='gallery_url')value={url:'http://127.0.0.1:5493/demo/portraits/tester-shemagh.webp'};
  if(b.action==='gallery_remove'){const i=gallery.findIndex(p=>p.id===b.payload.id);if(i>=0)gallery.splice(i,1);value={ok:true};}
  if(b.action==='notifications')value=[];
  if(b.action==='rewind'){assert.equal(b.payload.stage,1);if(b.payload.agree&&state.rewind?.actor==='abdulrahman'){state.stage=0;state.exclusive=false;delete state.rewind;}else if(b.payload.agree)state.rewind={actor:'reham',stage:1};else delete state.rewind;value={...state};}
  await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(value)});
 });
 await page.goto(process.env.BASE_URL||'http://127.0.0.1:5493');
 await page.getByRole('button',{name:/^رهام/}).click();await page.getByRole('button',{name:'دخول التجربة',exact:true}).click();
 await page.locator('.nf-tester-bar').waitFor({state:'attached'});
 await page.getByRole('button',{name:'استكشف الجميع',exact:true}).click();await page.locator('.dr-grid .df-person').first().waitFor();
 assert(await page.locator('.dr-grid .df-person').count()>2);
 await page.screenshot({path:'../output/nisfayn/directory-390.png',fullPage:true});
 await page.locator('.dr-grid .df-person').first().click();await page.locator('.mp-profile').waitFor();await page.waitForTimeout(500);
 assert.equal(await page.locator('.pg-error').count(),0);
 await page.screenshot({path:'../output/nisfayn/profile-390-new.png',fullPage:true});
 await page.locator('.mp-navigation .mp-back').click();
 await page.getByRole('button',{name:'تصفية الملفات',exact:true}).click();await page.getByLabel('المدينة',{exact:true}).fill('جدة');await page.getByRole('button',{name:'تطبيق التصفية',exact:true}).click();
 await page.getByText('لا توجد ملفات مناسبة حاليًا',{exact:true}).waitFor();await page.getByRole('button',{name:'مسح التصفية',exact:true}).click();
 await page.getByRole('button',{name:'الإعدادات',exact:true}).click();await page.getByRole('button',{name:/^صور ملفي إضافة/}).click();await page.getByRole('region',{name:'معرض ملفي',exact:true}).waitFor();
 const image=await page.screenshot();
 for(let i=0;i<3;i++){await page.locator('.pg-section input[type=file]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:image});await page.waitForFunction(n=>document.querySelectorAll('.pg-tile').length===n,i+1);}
 assert.equal(await page.locator('.pg-add').count(),0);
 await page.locator('.pg-open').first().click();await page.locator('.pg-lightbox[open]').waitFor();await page.getByRole('button',{name:'إغلاق الصورة',exact:true}).click();
 await page.getByRole('button',{name:'حذف الصورة 1',exact:true}).click();await page.locator('.pg-delete-confirm').getByRole('button',{name:'حذف',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.pg-tile').length===2);
 await page.getByRole('button',{name:'الإعدادات',exact:true}).click();
 state.exclusive=true;state.rewind={actor:'abdulrahman',stage:1};
 await page.getByRole('button',{name:/^المحادثات/}).click();await page.getByText('عبدالرحمن',{exact:true}).first().click();
 await page.getByRole('button',{name:'مسار التعارف',exact:true}).click();await page.getByRole('button',{name:/أوافق على العودة إلى:/}).click();
 assert.equal(state.stage,0);assert(!state.exclusive);await page.getByRole('button',{name:'إغلاق',exact:true}).click();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:320,height:700});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log('PASS directory, filters, profile, gallery add/limit/remove/lightbox, mutual rewind, 390/320 widths');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
