import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const baseline = process.argv[2];
const filename = '/src/onboarding/SignupBasicsSlides.tsx';
const server = await createServer({ root, mode: 'demo', plugins: [{
  name: 'resumed-identity-fixture', enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('/tests/fixtures/registration-qa.tsx')) {
      return code.replace("birthDate: '1997-03-14'", "birthDate: '', gender: new URLSearchParams(location.search).get('gender')");
    }
    if (baseline && id.endsWith(filename)) {
      return execFileSync('git', ['show', baseline + ':iphone' + filename], { cwd: root, encoding: 'utf8' });
    }
  },
}], server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const gender of ['woman', 'man']) {
    const page = await browser.newPage({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto(server.resolvedUrls.local[0] + 'tests/fixtures/registration-qa.html?chapter=identity&consolidation&gender=' + gender);
    const identity = page.locator('[data-chapter="identity"][data-slide-index]');
    await identity.locator('input[type=date]').fill('1997-03-14');
    let actions = 1;
    while (await identity.count()) {
      const prior = await identity.getAttribute('data-slide-index');
      await page.locator('footer button[type=submit]').click();
      actions++;
      await page.locator('[data-chapter="identity"][data-slide-index="' + prior + '"]').waitFor({ state: 'detached' });
      assert.ok(actions <= 4);
    }
    assert.equal(actions, baseline ? 4 : 2);
    console.log(gender, 'resumed identity actions:', actions);
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
