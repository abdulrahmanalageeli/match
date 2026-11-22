// Production registration components and styles with fictional, local drafts.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output = resolve(root, '.tmp/registration-layout');
await mkdir(output, { recursive: true });
const server = await createServer({ root, mode: 'demo', configFile: resolve(root, 'vite.config.ts'),
  cacheDir: resolve(root, 'node_modules/.vite-registration-layout'), server: { host: '127.0.0.1', port: 0, hmr: false },
  optimizeDeps: { entries: ['tests/fixtures/registration-qa.html'] },
});
let browser;
const report = [], errors = [], layoutErrors = [];
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ isMobile: true, hasTouch: true, locale: 'ar-SA', reducedMotion: 'reduce' });
  await page.route('**/*', route => {
    const {hostname,pathname} = new URL(route.request().url());
    if (hostname !== '127.0.0.1') return route.abort();
    if (pathname === '/api/interview') {
      assert.equal(route.request().postDataJSON().action,'load');
      return route.fulfill({json:{document:null,revision:0}});
    }
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(10000);
  const next = page.locator('.nf-intake-actions button[type=submit]');
  const slide = page.locator('.wd-signup-slides');
  const button = (name, exact = true) => page.getByRole('button', { name, exact });
  async function open(chapter, gender='woman') {
    const inset = page.viewportSize().width >= 390 ? 'home' : 'classic';
    await page.goto(server.resolvedUrls.local[0] + 'tests/fixtures/registration-qa.html?registration&assessment=current&inset=' + inset + '&chapter=' + chapter + '&gender=' + gender,
      {waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('main.nf-intake[data-chapter="' + chapter + '"]:not([data-preview])').waitFor();
    await page.evaluate(() => document.fonts.ready);
  }
  async function measure(name, { fit = false, capture = false } = {}) {
    const geometry = await page.evaluate(() => {
      const submit = document.querySelector('.nf-intake-actions button[type=submit], .wi-entry-footer .wi-button-primary');
      const content = document.querySelector('.nf-intake-form');
      const rect = node => node.getBoundingClientRect();
      const scrollAreas = [...document.querySelectorAll('main, main *')].filter(node =>
        /^(auto|scroll)$/.test(getComputedStyle(node).overflowY) && node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 2);
      const fields = [...content.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select')]
        .filter(node => rect(node).width > 0);
      return {
        width: innerWidth, height: innerHeight, documentHeight: document.documentElement.scrollHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth, submitBottom: Math.round(rect(submit).bottom),
        submitHeight: Math.round(rect(submit).height),
        inputFonts: fields.map(node => parseFloat(getComputedStyle(node).fontSize)),
        innerScroll: scrollAreas.filter(node => !node.matches('textarea,select')).map(node => node.scrollHeight - node.clientHeight),
      };
    });
    report.push({ name, ...geometry });
    assert.ok(geometry.overflowX <= 1, name + ' exceeds the viewport width');
    assert.ok(geometry.submitHeight >= 44, name + ' needs a comfortable primary tap target');
    assert.ok(geometry.inputFonts.every(size => size >= 16), name + ' has a zoom-triggering text field');
    if (fit && (geometry.documentHeight > geometry.height + 2 || geometry.submitBottom > geometry.height + 1 || geometry.innerScroll.length)) {
      layoutErrors.push({name, ...geometry});
    }
    if (capture) await page.screenshot({path: resolve(output, name + '-' + geometry.width + '.png'), animations:'disabled'});
    return geometry;
  }
  const back = button('رجوع');
  await page.addInitScript(() => {
    const apply = () => {
      const homeIndicator = new URLSearchParams(location.search).get('inset') === 'home';
      document.documentElement.style.setProperty('--nf-native-safe-top', homeIndicator ? '47px' : '20px');
      document.documentElement.style.setProperty('--nf-native-safe-bottom', homeIndicator ? '34px' : '0px');
    };
    if (document.documentElement) apply(); else document.addEventListener('DOMContentLoaded',apply,{once:true});
  });
  for (const {width,height} of [{width:320,height:568}, {width:375,height:667}, {width:390,height:844}]) {
    await page.setViewportSize({width,height});
    await open('identity');
    await page.locator('[data-field=displayName]').waitFor();
    await measure('identity',{fit:true,capture:true});
    await next.click();
    await page.locator('#wd-slide-error').waitFor();
    assert.equal(await slide.getAttribute('data-slide-index'),'0');
    await measure('identity-error',{fit:true});
    await page.locator('[data-field=displayName]').fill('نورة');
    await button('امرأة').click();
    await next.click();
    await page.locator('[data-field=birthDate]').waitFor();
    await measure('birth-date',{fit:true,capture:true});
    await page.locator('[data-field=birthDate]').fill('1998-05-12');
    await next.click();
    const city = button(/^مدينة الإقامة/,false);
    const picker = page.locator('dialog:modal');
    await city.waitFor();
    await measure('city',{fit:true,capture:true});
    await city.click();
    await picker.waitFor();
    const bounds = await picker.boundingBox();
    assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
    const search = picker.locator('input[type=search]');
    assert.equal(await search.evaluate(el=>el===document.activeElement),false);
    await search.fill('جدة');
    await picker.getByRole('option',{name:'جدة',exact:true}).click();
    await picker.waitFor({state:'detached'});
    assert.match(await city.innerText(),/جدة/);
    assert.equal(await city.evaluate(el=>el===document.activeElement),true);
    await city.click();
    await search.fill('الرياض');
    await page.keyboard.press('Escape');
    await picker.waitFor({state:'detached'});
    assert.match(await city.innerText(),/جدة/);
    await city.click();
    await picker.getByRole('button',{name:'إلغاء',exact:true}).click();
    await picker.waitFor({state:'detached'});
    await city.click();
    const sheet = await picker.boundingBox();
    await page.mouse.click(4, Math.max(1,sheet.y-8));
    await picker.waitFor({state:'detached'});
    assert.match(await city.innerText(),/جدة/);
    await back.click();
    assert.equal(await page.locator('[data-field=birthDate]').inputValue(),'1998-05-12');
    await back.click();
    assert.equal(await page.locator('[data-field=displayName]').inputValue(),'نورة');
    for (const chapter of ['story', 'compatibility', 'details', 'preferences', 'avatar', 'readiness', 'criteria', 'review']) {
      await open(chapter);
      if (chapter==='compatibility') {
        await measure('assessment-consent',{fit:width>=375});
        await page.getByRole('checkbox',{name:/أوافق على جلسة التوافق/}).click();
        await button('ابدأ الحوار مع لونا').waitFor();
      }
      if (chapter==='details') {
        const processing = page.getByRole('checkbox',{name:/أوافق على معالجة/});
        const publication = page.getByRole('checkbox',{name:/أوافق على عرض/});
        assert.equal(await publication.count(),0);
        await measure('details-processing',{fit:width>=375,capture:true});
        await processing.click();
        await publication.waitFor();
        assert.equal(await publication.isChecked(),false);
      }
      const shortGroup = chapter==='story' || (width>=375 && ['compatibility','details','preferences','avatar'].includes(chapter));
      await measure(chapter,{fit:shortGroup,capture:true});
      if (chapter==='preferences') {
        const contact = page.locator('input[data-field=contact]');
        assert.equal(await contact.inputValue(),'qa@example.com');
        assert.ok(await contact.evaluate(el => el.getBoundingClientRect().height>=44));
        await contact.fill('new@example.test');
        assert.equal(await contact.inputValue(),'new@example.test');
      }
      if (chapter==='avatar') {
        const settings = page.locator('details.nf-avatar-settings');
        assert.equal(await settings.evaluate(el => el.open),false);
        await settings.locator('summary').click();
        const style = settings.locator('.nf-avatar-styles button[aria-pressed=false]').first();
        const label = (await style.innerText()).trim();
        await style.click();
        assert.equal((await settings.locator('.nf-avatar-styles button[aria-pressed=true]').innerText()).trim(),label);
        assert.ok((await settings.locator('summary').innerText()).includes(label));
        await settings.locator('summary').click();
        assert.equal(await settings.evaluate(el => el.open),false);
      }
      if (chapter==='readiness' && width===375) {
        await button('أفضل وقتًا أطول قبل إشراكهم').click();
        const clarification = button('يعتمد على الشخص وظروفنا');
        await clarification.click();
        assert.equal(await clarification.getAttribute('aria-pressed'),'true');
        await button('أقدر أبدأ خطوة رسمية قريب').click();
        const agreement = page.getByRole('checkbox',{name:'أوافق على اتفاق العضوية'});
        await agreement.check();
        const blueprint = page.locator('.nf-readiness-blueprint');
        assert.equal(await blueprint.evaluate(el=>el.open),false);
        await blueprint.locator('summary').click();
        assert.equal(await blueprint.evaluate(el=>el.open),true);
        await page.getByRole('heading',{name:'اكتملت مراجعة توقعاتك',exact:true}).waitFor();
      }
      if (chapter==='criteria' || chapter==='review') {
        const lastGroup = page.locator('.nf-intake-form details > summary').last();
        await lastGroup.scrollIntoViewIfNeeded();
        await lastGroup.click();
        assert.ok(await lastGroup.evaluate(el => el.parentElement.open));
        await next.scrollIntoViewIfNeeded();
        assert.ok(await next.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }));
      }
    }
    await open('avatar','man');
    await measure('avatar-man',{fit:width>=375,capture:true});
  }
  // The shortest width and larger type can scroll. All active content stays reachable.
  await page.setViewportSize({width:320,height:568});
  await open('review');
  await page.evaluate(() => { document.documentElement.dataset.nfText='large'; });
  const long = await measure('review-large-text',{capture:true});
  assert.ok(long.documentHeight > long.height || long.innerScroll.length,'long review should retain vertical scrolling');
  await next.scrollIntoViewIfNeeded();
  const rect = await next.boundingBox();
  assert.ok(rect.y >= 0 && rect.y+rect.height <= long.height+1);
  for(const width of [430,1024]) {
    await page.setViewportSize({width,height:844});
    await open('identity');
    await measure('identity-wide');
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
  assert.deepEqual(layoutErrors,[],'Short registration steps should fit without scrolling');
  console.log('PASS: short registration steps, RTL picker, validation, Back, long review, safe areas, large text and responsive inputs');
} finally { await browser?.close(); await server.close(); }

