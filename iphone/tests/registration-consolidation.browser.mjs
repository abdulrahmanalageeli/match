import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const baseline = process.argv.includes('--baseline');
const folder = '.tmp/registration-consolidation/' + (baseline ? 'before' : 'after');
await mkdir(folder, { recursive: true });
const server = await createServer({ mode: 'demo', server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['tests/fixtures/registration-qa.html'] } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [width,height] of [[375,812],[430,932]]) {
    const page = await browser.newPage({ viewport: { width,height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    for (const chapter of ['criteria','details','readiness']) {
      await page.goto(server.resolvedUrls.local[0] + 'tests/fixtures/registration-qa.html?consolidation&chapter=' + chapter);
      await page.locator('main[data-chapter="'+chapter+'"]').waitFor();
      const next = page.locator('footer button[type=submit]');
      if (chapter === 'details') await next.click();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: folder+'/'+chapter+'-'+width+'.png', fullPage:true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
      if (baseline) continue;
      if (chapter === 'criteria') {
        const family = page.locator('details[data-section="الحياة السابقة والعادات"]');
        await family.locator('summary').click();
        const status = family.locator('fieldset.nf-criterion').first();
        await status.getByRole('button',{name:'أفضل',exact:true}).click();
        assert.equal(await status.locator('input:checked').count(),0);
        await page.getByRole('button',{name:'الباقي لا يهمني',exact:true}).click();
        assert.equal(await family.locator('fieldset.nf-criterion').last().getByRole('button',{name:'شرط أساسي'}).getAttribute('aria-pressed'),'true');
        await next.click();
        await page.locator('#nf-intake-error').waitFor();
        await status.locator('input').nth(1).check();
        await next.click();
        await page.locator('main[data-chapter="preferences"]').waitFor();
      } else if (chapter === 'details') {
        assert.equal(await page.getByRole('spinbutton',{name:/الطول/}).count(),0);
        await page.getByRole('spinbutton',{name:/الوزن/}).fill('65');
        assert.equal(await page.getByRole('spinbutton',{name:/الوزن/}).inputValue(),'65');
      } else {
        assert.equal(await page.locator('.nf-readiness-clarify').count(),2);
        assert.match(await page.locator('.nf-readiness-intake').innerText(),/٦–١٢/);
        await next.click();
        await page.locator('#nf-intake-error').waitFor();
      }
    }
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
