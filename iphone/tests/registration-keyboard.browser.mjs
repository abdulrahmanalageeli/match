// Real registration component/CSS with simulated iOS visualViewport events.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output = resolve(root, '.tmp/registration-keyboard');
await mkdir(output, { recursive: true });
const server = await createServer({ root, mode: 'demo', configFile: resolve(root, 'vite.config.ts'),
  cacheDir: resolve(root, 'node_modules/.vite-registration-keyboard'),
  server: { host: '127.0.0.1', port: 5288, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA' });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.addInitScript(() => {
    window.__keyboard = { height: 844, top: 0 };
    Object.defineProperties(window.visualViewport, {
      height: { get: () => window.__keyboard.height }, offsetTop: { get: () => window.__keyboard.top },
    });
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(60000);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('http://127.0.0.1:5288/tests/fixtures/registration-qa.html?chapter=identity', { waitUntil: 'domcontentloaded' });
    const city = page.locator('input[data-field="city"]');
    await city.waitFor(); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); await city.fill('الرياض');
    await page.evaluate(() => { window.__keyboard.height = 440; window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-nf-form-viewport'));
    await page.waitForTimeout(200);
    // Expanding back to all cities must keep the input and a usable option list visible.
    await city.fill(''); await page.waitForTimeout(100);
    const geometry = await city.evaluate(field => {
      const shell = field.closest('[data-nf-keyboard-form]'), bounds = field.getBoundingClientRect();
      return { shellHeight: shell.clientHeight, documentHeight: document.documentElement.scrollHeight,
        viewportHeight: innerHeight, inputTop: bounds.top, inputBottom: bounds.bottom,
        width: document.documentElement.scrollWidth, viewportWidth: innerWidth,
        headerBottom: shell.querySelector('.nf-intake-header').getBoundingClientRect().bottom,
        listBottom: shell.querySelector('.nf-choice-panel').getBoundingClientRect().bottom,
        actions: getComputedStyle(shell.querySelector('.nf-intake-actions')).position };
    });
    assert.equal(geometry.shellHeight, 440);
    assert.ok(geometry.documentHeight <= geometry.viewportHeight, JSON.stringify(geometry));
    assert.ok(geometry.width <= geometry.viewportWidth, JSON.stringify(geometry));
    assert.ok(geometry.inputTop >= geometry.headerBottom && geometry.inputBottom <= 440, JSON.stringify(geometry));
    assert.ok(geometry.listBottom <= 440, JSON.stringify(geometry));
    assert.equal(geometry.actions, 'static');
    await page.evaluate(() => { window.__keyboard.top = 28; window.visualViewport.dispatchEvent(new Event('scroll')); });
    await page.waitForFunction(() => document.querySelector('[data-nf-keyboard-form]').getBoundingClientRect().top === 28);
    if (width === 390) await page.screenshot({ path: resolve(output, 'identity-keyboard.png') });
    const name = page.locator('input[data-field="displayName"]');
    await name.fill('نورة'); await page.waitForTimeout(100);
    assert.equal(await name.evaluate(field => field.getBoundingClientRect().top >= field.closest('.nf-intake').querySelector('.nf-intake-header').getBoundingClientRect().bottom), true);
    await name.blur();
    await page.waitForTimeout(50);
    assert.equal(await page.locator('[data-nf-keyboard-form]').count(), 1, 'closing animation keeps the shell');
    await page.evaluate(() => { window.__keyboard.height = 844; window.__keyboard.top = 0; window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-nf-form-viewport'));
    console.log(`${width}px: keyboard opens, pans, closes without page growth or field occlusion`);
  }
  assert.deepEqual(errors, []);
} finally { await browser?.close(); await server.close(); }
