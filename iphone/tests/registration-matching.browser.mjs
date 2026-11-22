// Two isolated synthetic accounts. Chrome operates the real registration screens.
// SMS, portrait processing, and interview transport are local fixtures.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { confirmProfileChoices, initialInterviewDocument } from '../api/_lib/interview.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const { chromium } = createRequire(import.meta.url)(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(root, '.tmp/registration-matching');
await mkdir(output, { recursive: true });
const cloud = `
  const account = () => JSON.parse(sessionStorage.getItem('qa-account') || 'null');
  export const cloudSelected = true, cloudConnection = null, phoneOtpEnabled = false;
  export const cloud = {auth: {getSession: async () => ({data:{session:{user:{id:account()?.id},access_token:'synthetic'}}})}};
  export class CloudError extends Error {}
  export async function cloudSessionId() { return account()?.id; }
  export async function callRpc(name, {command, payload}, owner) {
    if (name !== 'marriage_onboarding_draft' || owner !== account().id) throw Error('Unexpected fixture RPC');
    if (command === 'load') return JSON.parse(sessionStorage.getItem('qa-draft') || 'null');
    if (command === 'save') sessionStorage.setItem('qa-draft', JSON.stringify(payload));
    if (command === 'delete') sessionStorage.removeItem('qa-draft');
    return {saved:true};
  }
  export function createRecoveryClient() {return cloud}
  export function cloudLogout() {}
  export function cloudRequest() {throw Error('Unexpected external request')}
  export {cloudRequest as resendSignupConfirmation,cloudRequest as sendPhoneOtp,cloudRequest as verifyPhoneOtp};
`;
const portrait = `
  export async function stageOnboardingPortrait(draft, gender, consent) {
    if (!consent || !draft) throw Error('Missing consent or portrait');
    return {...draft, staged:{id:'synthetic-photo',status:gender==='woman'?'ready':'uploaded',portrait:{id:'synthetic-photo',path:'local-only',blur:draft.blur,revealPolicy:draft.revealPolicy}}};
  }
  export async function retryStagedPortrait(draft) {return {...draft,staged:{...draft.staged,status:'verified'}}}
  export async function requestPortraitModeration(draft) {return {...draft,staged:{...draft.staged,status:'moderation'}}}
  export async function resumeStagedPortrait() {return null}
  export async function finalizeStagedPortrait(draft) {return draft.staged.portrait}
  export async function discardStagedPortrait() {}
`;
const server = await createServer({ root, configFile: resolve(root,'vite.config.ts'), cacheDir: resolve(root,'node_modules/.vite-registration-matching'),
  server: {host:'127.0.0.1',port:0}, optimizeDeps:{ entries:[], include:['react','react-dom/client','react/jsx-runtime','lucide-react','@capacitor/core','react-native-reanimated','react-native-worklets'] },
  plugins:[{name:'local-registration', enforce:'pre', load(id) {
    const file = id.replaceAll('\\','/');
    if (file.endsWith('/src/cloud.ts')) return cloud;
    if (file.endsWith('/src/photos/stagedPortrait.ts')) return portrait;
    if (file.endsWith('/src/auth/SignupSms.tsx')) return "export async function confirmSignupSms(){return {phoneProof:'synthetic-proof',deviceId:'test-device'}}";
    if (file.endsWith('/src/motion/SkiaSurface.tsx')) return "import {createElement} from 'react';export function SkiaSurface({fallback}){return createElement('div',{'aria-hidden':true},fallback)}";
  }, configureServer(dev) {
    dev.middlewares.use(async (req,res,next) => {
      if (req.url !== '/__registration') return next();
      res.setHeader('Content-Type','text/html');
      res.end(await dev.transformIndexHtml('/__registration','<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/registration-matching-fixture.tsx"></script></html>'));
    });
  } }]
});

const opening = 'أعمل في التقنية والبرمجة. يناسبني الزواج خلال ثلاثة إلى ستة أشهر. أبحث عن حياة مستقرة وأفضّل إشراك الأهل من البداية.';
const profileFacts = [
  { fieldId: 'profession', value: 'التقنية والبرمجة', quote: 'أعمل في التقنية والبرمجة' },
  { fieldId: 'familyPreference', value: 'من البداية', quote: 'أفضّل إشراك الأهل من البداية' },
  { fieldId: 'marriageBasics.marriageTimeline', value: 'three_to_six_months', quote: 'يناسبني الزواج خلال ثلاثة إلى ستة أشهر' },
];
function interviewTransport() {
  let snapshot = {document:null,revision:0};
  return async route => {
    const p = route.request().postDataJSON();
    if (p.action === 'start') snapshot = {revision:1,document:initialInterviewDocument(true)};
    else if (p.action === 'draft') snapshot.document.draftAnswer = p.answer;
    else if (p.action === 'answer') {
      const doc = snapshot.document;
      assert.equal(p.answer, opening);
      const profileProposals = profileFacts.map(({fieldId,value,quote}) => ({
        id:'profile:'+fieldId,fieldId,values:[value],mode:null,exclude:false,
        evidence:[{turnId:'opening',quote}],summary:quote,needsClarification:false,
      }));
      snapshot = {revision:snapshot.revision+1,carryForwardIds:[],coverage:{answered:0,required:47},
        document:{...doc,profileProposals,status:'review',currentQuestion:null,lastMode:'luna',pendingAnalysis:false,draftAnswer:'',turns:[{id:'opening',topic:'intent',question:doc.currentQuestion.text,answer:p.answer,skipped:false}]}};
    } else if (p.action === 'structuredConfirm') {
      const confirmed = p.choices.map(choice => {
        const [kind,fieldId,side] = choice.id.split(':');
        return {...choice,kind,fieldId,side,summary:'',evidence:[],needsClarification:false};
      });
      const doc = p.profileChoices?.length ? confirmProfileChoices(snapshot.document,p.profileChoices) : snapshot.document;
      snapshot = {revision:snapshot.revision+1,structuredConfirmation:true,coverage:{answered:confirmed.length,required:confirmed.length},document:{...doc,status:'confirmed',confirmed}};
    } else if (p.action !== 'load') throw Error('Unexpected interview action '+p.action);
    return route.fulfill({json:snapshot});
  };
}

async function register(browser, gender) {
  const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ar-SA',reducedMotion:'reduce'});
  const errors = [], external = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', event => {errors.push(event.message); console.error(event.message)});
  const interview = interviewTransport();
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.hostname !== '127.0.0.1') {external.push(u.origin);return route.abort()}
    return u.pathname === '/api/interview' ? interview(route) : route.continue();
  });
  const button = name => page.getByRole('button',{name,exact:typeof name === 'string'});
  const next = () => page.locator('.nf-intake-actions > button[type=submit]').click();
  const chapter = async key => {
    await page.locator('main[data-chapter='+key+']').waitFor();
    await page.waitForFunction(() => {
      const form = document.querySelector('[data-nf-keyboard-form]');
      return window.scrollY < 2 && (!form || form.scrollTop < 2);
    }, null, {timeout:5000});
  };
  const select = async (label,value) => {await button(label).click();await page.getByRole('option',{name:value,exact:true}).click()};
  const person = gender==='man'?'خالد':'سارة';
  try {
    await page.goto(server.resolvedUrls.local[0]+'__registration',{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('input[name=email]').fill(gender+'@example.test');
    await page.locator('input[name=password]').fill('synthetic-password-only');
    await button('متابعة').click();
    for (const consent of await page.getByRole('checkbox').all()) await consent.check();
    await button('إنشاء الحساب').click();
    await chapter('identity');
    await page.getByLabel('الاسم الأول',{exact:true}).fill(person);
    await page.getByLabel('اسم العائلة',{exact:true}).fill('الناصر');
    await page.locator('[data-field=displayName]').fill(person);
    await button(gender==='man'?'رجل':'امرأة').click(); await next();
    await page.locator('[data-field=birthDate]').fill(gender==='man'?'1995-03-02':'1997-04-15'); await next();
    await button('الرياض').click(); await select(/^ما جنسيتك/,'سعودي'); await next();
    await button(/^لم يسبق.*الزواج$/).click(); await next();
    await chapter('compatibility');
    await page.getByRole('checkbox',{name:/أوافق على جلسة التوافق/}).click();
    await button('ابدأ الحوار مع لونا').click();
    await page.locator('#wi-answer').fill(opening);
    await button('إرسال الرسالة').click();
    const card = page.locator('.wi-hybrid-card');
    await card.waitFor();
    for (let i=0;await card.count();i++) {
      assert(i<65,'assessment must advance');
      await card.locator('fieldset .wi-hybrid-option').first().press('Space');
    }
    const carryProfile = page.locator('.wi-profile-carry-choice input');
    assert(await carryProfile.isVisible(),'the profile opt-in must be visible without opening a disclosure');
    assert.equal(await carryProfile.isChecked(),false);
    const carry = gender==='woman';
    if(carry) await carryProfile.check();
    await button('اعتماد إجاباتي').click();
    await button('متابعة إعداد الملف').click(); await next();
    await chapter('details');
    await next();
    await page.getByRole('alert').filter({hasText:'راجع ووافق على معالجة التفاصيل الحساسة وعرضها'}).waitFor();
    assert.equal(await page.getByRole('checkbox',{name:/أوافق على معالجة/}).isChecked(),false);
    await page.getByRole('checkbox',{name:/أوافق على معالجة/}).click();
    await next();
    await page.getByRole('alert').filter({hasText:'راجع ووافق على معالجة التفاصيل الحساسة وعرضها'}).waitFor();
    assert.equal(await page.getByRole('checkbox',{name:/أوافق على عرض/}).isChecked(),false);
    await page.getByRole('checkbox',{name:/أوافق على عرض/}).check(); await next();
    await page.waitForFunction(() => {
      const d = JSON.parse(sessionStorage.getItem('qa-draft') || 'null');
      return d?.permissions.sensitivePublication && d.step === 'details';
    });
    await page.reload();
    await chapter('details');
    await page.getByRole('checkbox',{name:/أوافق على عرض/}).waitFor();
    assert(await page.getByRole('checkbox',{name:/أوافق على عرض/}).isChecked());
    await next();
    const slides = page.locator('.wd-signup-slides[data-chapter=details]');
    for(let i=0;await slides.count();i++) {
      assert(i<12,'details must advance');
      const step=Number(await slides.getAttribute('data-slide-index'));
      if(step===1) {
        await page.getByRole('spinbutton',{name:/^الطول/}).fill(gender==='man'?'178':'165');
        await page.getByRole('spinbutton',{name:/^الوزن/}).fill(gender==='man'?'75':'60');
        await page.locator('.nf-tone-choices button').nth(2).click();
      } else if(step===2) {
        await page.locator('.nf-language-chips').getByText('العربية',{exact:true}).click();
        await select(/^عند اختلاف اللغة/,'أفضّل أن نتحدث لغة مشتركة');
      } else if(step===4) {
        const timing = button('خلال ٣–٦ أشهر');
        if(carry) assert.equal(await timing.count(),0,'accepted marriage timing must not be asked again');
        else await timing.click();
        await button('أفضل لقاءً بحضور الأهل قبل الخطوة الرسمية').click();
      } else if(step===5) {
        await button(/لا (أرغب|أقبل|أفضل|أفكر).*التعدد/).click();
      } else if(step===6) {
        if(await button(/^عدد الأبناء/).count()) await select(/^عدد الأبناء/,'دون أبناء');
        await button('لا أستخدم أيًا منها').click();
      }
      await next();
    }
    await chapter('criteria');
    await button(/لا تفضيل لديّ في المعايير المتبقية/).click(); await next();
    await chapter('preferences');
    if(carry) {
      const savedFamily = page.locator('details').filter({has:page.locator('summary',{hasText:'وقت إشراك الأهل: من البداية'})});
      assert.equal(await savedFamily.evaluate(node=>node.open),false);
      await savedFamily.locator('summary').click();
      assert.equal(await button('من البداية').getAttribute('aria-pressed'),'true');
      await savedFamily.locator('summary').click();
    } else await button('من البداية').click();
    await next();
    await chapter('story');
    if(carry) assert.equal(await button(/^مجال العمل أو الوضع المهني/).count(),0,'accepted profession must not be asked alongside missing education');
    else await select(/^مجال العمل أو الوضع المهني/,'التقنية والبرمجة');
    await select(/^المؤهل الدراسي/,'بكالوريوس'); await next();
    assert(await page.locator('[data-field=bio]').inputValue()); await next();
    for(const choice of await page.locator('.nf-prompt-choices button').all()) {
      await choice.click(); await page.locator('.nf-prompt-editor textarea').fill('التفاهم والاحترام مهمان في حياتي.');
    }
    await next(); await button('أبحث عن زواج جاد').click(); await next();
    await chapter('avatar');
    if(gender==='woman') await page.getByRole('tab',{name:/صورة بتمويه اختياري/}).click();
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=500;c.height=600;const ctx=c.getContext('2d');ctx.fillStyle='#bd9a9a';ctx.fillRect(0,0,500,600);return c.toDataURL().split(',')[1]});
    await page.locator('input[type=file]').setInputFiles({name:'fictional.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await button('اعتماد الإطار').click();
    if(gender==='woman') {
      await page.locator('#portrait-blur:enabled').press('End');
      await page.locator('.nf-photo-reveal select').selectOption('family');
    }
    await page.locator('.nf-photo-consent input').check();
    await page.getByText(gender==='man'?'صورتك جاهزة، اكتملت مطابقة الصورة.':'صورتك جاهزة بإعدادات الخصوصية التي اخترتِها.',{exact:true}).waitFor();
    await next(); await chapter('readiness');
    await page.getByText('أرتاح لإشراك الأهل من البداية',{exact:true}).waitFor();
    assert.equal(await button('أرتاح لإشراك الأهل من البداية').count(),0,'readiness carries forward the family timing');
    await button('أقدر أبدأ خطوة رسمية قريب').click();
    await page.getByRole('checkbox',{name:'أوافق على اتفاق العضوية'}).check(); await next();
    await chapter('review');
    const integrity = page.getByRole('checkbox',{name:/أقرّ بصدق إجاباتي/});
    assert.equal(await integrity.isChecked(),false);
    await next();
    await page.getByRole('alert').filter({hasText:'إقرار صدق الإجابات'}).waitFor();
    assert.equal(await integrity.evaluate(node=>node===document.activeElement),true);
    assert.equal(await page.evaluate(()=>Boolean(window.__submitted)),false);
    if(carry) {
      await integrity.check();
      const personal = page.locator('.nf-intake-review-group').filter({has:page.locator('summary',{hasText:'تفاصيلك الشخصية'})});
      if(!await personal.evaluate(node => node.open)) await personal.locator('summary').click();
      await personal.getByRole('button',{name:'تعديل تفاصيلك الشخصية'}).click();
      await chapter('details');
      for (let i=0;i<8;i++) {
        assert.equal(Number(await slides.getAttribute('data-slide-index')),i);
        await next();
      }
      await page.getByRole('heading',{name:'خطط الحياة الزوجية',exact:true}).waitFor();
      await next(); await chapter('review');
      assert.equal(await integrity.isChecked(),false,'returning from corrections requires a fresh acknowledgment');
    }
    await integrity.check();
    await next(); await page.getByRole('heading',{name:'تم إرسال الملف'}).waitFor();
    const {account,profile,photo,photoStatus}=await page.evaluate(()=>window.__submitted);
    assert.equal(profile.displayName,person);assert.equal(profile.gender,gender);
    assert.equal(profile.profession,'التقنية والبرمجة');
    assert.equal(profile.marriageBasics.marriageTimeline,'three_to_six_months');
    assert.equal(photoStatus,gender==='man'?'verified':'ready');
    assert.equal(Object.keys(profile.personalityAnswers).length,15);
    assert(profile.signupConsents.assessment && profile.signupConsents.sensitivePublication);
    assert.equal(profile._applicationIntegrity,'wudayn-application-integrity-v1');
    assert.equal(profile._membershipReadiness.family,'early');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS',gender,'account entry, identity, assessment, sensitive draft recovery, photo, readiness and application submission');
    if(gender==='woman') assert.deepEqual(photo,{blur:100,revealPolicy:'family'});
    return {profile,account,photo};
  } catch(error) {
    await page.screenshot({path:resolve(output,gender+'-failure.png')}).catch(()=>{});
    console.error(gender,(await page.locator('body').innerText()).slice(-2500));throw error;
  } finally {await page.close()}
}

let browser;
try {
  await server.listen();
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const profiles=[], identities={}, portraits={};
  for(const gender of ['man','woman']) {
    const {profile,account,photo}=await register(browser,gender);
    profiles.push(profile);
    identities[gender]=account;
    portraits[gender]=photo;
  }
  const {runRegistrationMatching}=await import('../supabase/tests/registration-matching-journey.mjs');
  console.log('PASS',await runRegistrationMatching(profiles,identities,portraits));
} finally {await browser?.close();await server.close()}
