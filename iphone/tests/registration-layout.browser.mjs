// Real registration components and production CSS, with fictional local-only data.
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
  cacheDir: resolve(root, 'node_modules/.vite-registration-layout'),
  server: { host: '127.0.0.1', port: 5289, strictPort: true },
  optimizeDeps: { entries: ['tests/fixtures/registration-qa.html'] },
});
await server.listen();
let browser;
const checks = [], errors = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.setDefaultTimeout(30000);
  async function open(chapter) {
    await page.goto(`http://127.0.0.1:5289/tests/fixtures/registration-qa.html?chapter=${chapter}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator(`.nf-intake[data-chapter="${chapter}"]`).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700); // Allow the real chapter reveal to settle before measuring and capturing.
  }
  for (const width of [320, 390, 430, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const chapter of ['identity', 'story', 'details', 'criteria', 'preferences', 'review']) {
      await open(chapter);
      const geometry = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll('.nf-intake input:not([type=checkbox]):not([type=radio]), .nf-intake textarea')]
          .filter(input => input.getBoundingClientRect().width > 0)
          .map(input => ({ font: parseFloat(getComputedStyle(input).fontSize), width: input.getBoundingClientRect().width })),
      }));
      assert(geometry.document <= geometry.viewport + 1, `${chapter} overflows at ${width}: ${JSON.stringify(geometry)}`);
      assert(geometry.controls.every(input => input.font >= 16), `${chapter} has zoom-triggering inputs at ${width}`);
      if (chapter === 'identity') {
        const gap = await page.evaluate(() => {
          const [birthday, city] = document.querySelector('.field-pair').children;
          return city.getBoundingClientRect().top - birthday.getBoundingClientRect().bottom;
        });
        assert(gap >= 20, `Birthday/city gap ${gap} at ${width}`);
      }
      if (width === 390 || (width === 320 && chapter === 'identity')) await page.screenshot({ path: resolve(output, `${chapter}-${width}.png`), fullPage: true });
      checks.push(`${chapter}: ${width}px fits with readable inputs`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open('identity');
  await page.locator('[data-field="displayName"]').fill('');
  await page.locator('.nf-intake-actions button[type=submit]').click();
  await page.locator('#nf-intake-error').waitFor();
  assert.equal(await page.locator('[data-field="displayName"]').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('[data-field="displayName"]').evaluate(input => input === document.activeElement), true);
  checks.push('Required name validation keeps user on the step and focuses the field');
  await page.locator('[data-field="displayName"]').fill('نورة للتجربة');
  await page.locator('[data-field="birthDate"]').fill('1998-05-12');
  const city = page.locator('[data-field="city"]');
  await city.fill('جدة');
  await page.getByRole('option', { name: 'جدة', exact: true }).click();
  assert.equal(await city.inputValue(), 'جدة');
  checks.push('City search accepts and preserves a selected city');
  await page.locator('.nf-intake-actions button[type=submit]').click();
  await page.locator('.nf-intake[data-chapter="story"]').waitFor();
  await page.getByRole('button', { name: 'رجوع', exact: true }).click();
  await page.locator('.nf-intake[data-chapter="identity"]').waitFor();
  assert.equal(await page.locator('[data-field="displayName"]').inputValue(), 'نورة للتجربة');
  assert.equal(await page.locator('[data-field="birthDate"]').inputValue(), '1998-05-12');
  assert.equal(await page.locator('[data-field="city"]').inputValue(), 'جدة');
  checks.push('Next/back navigation preserves name, birthday, and city');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, errors, output }));
} finally {
  await browser?.close();
  await server.close();
}
