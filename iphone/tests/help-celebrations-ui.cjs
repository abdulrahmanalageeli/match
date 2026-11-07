const {chromium}=require('C:/Users/timgo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(12000);
 const errors=[],actions=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('nisfayn.devicePreferences.v1',JSON.stringify({matchSound:false,largeText:false,reducedMotion:false})));
 const state={actor:'reham',matched:true,messages:[],read:{},delivered:{},profiles:{},stage:0,agree:{},exclusive:false,exclusiveConsent:{},call:null,callPermission:{status:'none'},seriousness:{status:'accepted',days:14,deadline:'2026-12-01T00:00:00Z'}};
 await page.route('**/functions/v1/pair-test*',async route=>{
  const b=route.request().postDataJSON();actions.push(b.action);let value={...state,session:'a'.repeat(64)};
  if(['gallery_list','notifications'].includes(b.action))value=[];
  if(b.action==='permission_accept'){state.callPermission={status:'accepted',invitedBy:'abdulrahman'};value={...state};}
  if(b.action==='step'){state.agree.reham=b.payload.agree;value={...state};}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 await page.goto(process.env.BASE_URL||'http://127.0.0.1:5493');
 await page.getByRole('button',{name:/^رهام/}).click();await page.getByRole('button',{name:'دخول التجربة',exact:true}).click();
 await page.locator('.nf-tester-bar').waitFor({state:'attached'});
 await page.getByRole('button',{name:'كيف أبدأ؟ وما معنى التوافق؟',exact:true}).click();
 await page.locator('.nf-help[open]').waitFor();
 assert.equal(await page.locator('.nf-help-topics button[aria-pressed=true]').textContent(),'الاكتشاف');
 await page.getByLabel('ابحث في دليل نصفين').fill('نسبة');
 await page.getByText('هل نسبة التوافق تعني احتمال نجاح الزواج؟',{exact:true}).click();
 assert((await page.locator('.nf-help details[open] p').textContent()).startsWith('لا.'));
 await page.getByLabel('ابحث في دليل نصفين').fill('no-result');await page.getByRole('button',{name:'عرض جميع الإجابات',exact:true}).click();
 assert(await page.locator('.nf-help details').count()>=20);
 await page.getByLabel('ابحث في دليل نصفين').fill('العودة');await page.locator('.nf-help details').first().locator('summary').click();
 await page.waitForTimeout(350);await page.screenshot({path:'../output/nisfayn/help-390.png'});
 await page.setViewportSize({width:320,height:700});
 assert(await page.locator('.nf-help').evaluate(el=>el.scrollWidth<=el.clientWidth));
 await page.screenshot({path:'../output/nisfayn/help-320.png'});
 await page.keyboard.press('Escape');assert.equal(await page.locator('.nf-help[open]').count(),0);
 if(process.env.SMOKE_ONLY){assert.deepEqual(errors,[]);console.log('PASS deployed guide, search, responsive dialog and keyboard dismissal; mocked API only.');return;}
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:/^المحادثات/}).click();await page.getByText('عبدالرحمن',{exact:true}).first().click();
 await page.getByLabel('رسالتك',{exact:true}).fill('مسودة محفوظة أثناء التحديث');
 state.exclusiveConsent.reham=true;
 await page.waitForTimeout(3300);assert.equal(await page.locator('.nf-match[open]').count(),0,'One approval cannot celebrate');
 state.exclusive=true;state.stage=1;state.exclusiveConsent.abdulrahman=true;state.journeyUpdatedAt=new Date().toISOString();
 await page.waitForTimeout(3300);assert.equal(await page.locator('.nf-match[open]').count(),0,'Typing must not be interrupted');
 await page.getByRole('button',{name:'خيارات المحادثة',exact:true}).click();
 await page.getByRole('button',{name:/دليل المحادثة/}).click();await page.waitForTimeout(600);
 assert.equal(await page.locator('.nf-match[open]').count(),0,'Help must not be covered by a celebration');
 await page.getByRole('button',{name:'إغلاق الدليل',exact:true}).click();
 await page.locator('.nf-match[data-milestone=exclusive][open]').waitFor();
 assert.equal(await page.getByRole('heading',{name:'اخترتما بعضكما',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:'تفعيل صوت التوافق',exact:true}).getAttribute('aria-pressed'),'false');
 await page.waitForTimeout(1400);await page.screenshot({path:'../output/nisfayn/exclusive-celebration-390.png'});
 await page.getByRole('button',{name:'إغلاق احتفال المرحلة',exact:true}).click();
 assert.equal(await page.getByLabel('رسالتك',{exact:true}).inputValue(),'مسودة محفوظة أثناء التحديث');
 await page.getByRole('button',{name:'مسار التعارف',exact:true}).click();
 await page.getByRole('button',{name:'اقتراح: الخطوة الرسمية أو العائلية',exact:true}).click();
 await page.getByText('وصل اقتراحك',{exact:true}).waitFor();
 await page.getByRole('button',{name:'سحب طلبي',exact:true}).click();
 await page.getByText('سُحب الاقتراح',{exact:true}).waitFor();
 await page.getByRole('button',{name:'إغلاق',exact:true}).click();
 await page.emulateMedia({reducedMotion:'reduce'});
 state.stage=2;state.journeyUpdatedAt=new Date().toISOString();
 await page.locator('.nf-match[data-milestone=family][open]').waitFor();
 assert.equal(await page.locator('.nf-match').getAttribute('data-motion'),'still');
 assert.equal(await page.locator('.nf-match-half-left').evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.setViewportSize({width:320,height:700});
 assert(await page.locator('.nf-match').evaluate(el=>el.scrollWidth<=el.clientWidth));
 await page.screenshot({path:'../output/nisfayn/family-celebration-320.png'});
 await page.getByRole('button',{name:'إغلاق احتفال المرحلة',exact:true}).click();
 await page.waitForTimeout(3300);assert.equal(await page.locator('.nf-match[open]').count(),0,'Polling must not replay celebrations');
 state.callPermission={status:'pending',invitedBy:'abdulrahman'};
 await page.getByRole('button',{name:'السماح بالمكالمات',exact:true}).click();
 await page.getByText('أصبح للصوت مكان بينكما',{exact:true}).waitFor();
 assert(!actions.includes('call_start'),'Permission acceptance must not start a call');
 await page.screenshot({path:'../output/nisfayn/call-permission-320.png'});
 await page.getByRole('button',{name:'إغلاق',exact:true}).click();
 // Reopening an already-confirmed relationship is not a new milestone.
 await page.reload();
 await page.locator('.nf-tester-bar').waitFor({state:'attached'});await page.waitForTimeout(3300);
 assert.equal(await page.locator('.nf-match[open]').count(),0);
 await page.getByRole('button',{name:'الإعدادات',exact:true}).click();
 await page.getByRole('button',{name:/دليلك في نصفين/}).click();await page.locator('.nf-help[open]').waitFor();
 assert.equal(await page.locator('.nf-help-topics button[aria-pressed=true]').textContent(),'الكل');
 assert.deepEqual(errors,[]);
 console.log('PASS guide search/context/keyboard/320-390 layouts; mutual-only celebrations; typing and dialog deferral; preserved draft; withdrawal feedback; reduced motion and muted sound; call consent does not auto-call; no replay on polling or login. Mock API only.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
