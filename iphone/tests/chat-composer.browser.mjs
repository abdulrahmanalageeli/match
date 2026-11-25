import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ root, cacheDir: 'node_modules/.vite-chat-composer',
  optimizeDeps: { entries: ['tests/fixtures/chat-privacy-qa.html'] }, server: { host: '127.0.0.1', port: 0, hmr: false } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, locale: 'ar-SA', isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    const start = Date.UTC(2025, 0, 8, 9);
    const history = Array.from({ length: 100 }, (_, i) => ({
      id: 'history-' + i, body: 'رسالة سابقة ' + i, sender: i % 2 ? 'reham' : 'abdulrahman',
      createdAt: new Date(start + i * 60000).toISOString(),
    }));
    localStorage.setItem('nisfayn-local-chat-privacy-qa-composer', JSON.stringify(history));
    // Count timestamp formatting of one known bubble as an observable history render.
    const original = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format');
    window.historyFormats = 0;
    Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', { ...original, get() {
      const format = original.get.call(this);
      return value => { if (Number(value) === start) window.historyFormats++; return format(value); };
    } });
  });
  const openChat = page.getByRole('button', { name: /فتح المحادثة مع/ });
  const draft = page.getByRole('textbox', { name: 'رسالتك' });
  const send = page.getByRole('button', { name: 'إرسال الرسالة' });
  await page.goto(server.resolvedUrls.local[0] + 'tests/fixtures/chat-privacy-qa.html?case=composer&feedback');
  await openChat.click({ timeout: 90000 });
  await page.locator('[data-server-id="history-99"]').waitFor();
  const log = page.getByRole('log');
  const feedback = page.locator('.wf-window');
  const plan = page.locator('.cm-chat-plan');
  const compose = page.locator('.cm-chat-compose');
  await plan.locator('.cm-agreement-summary button').waitFor();
  await feedback.waitFor();
  assert.equal(await plan.locator('.cm-agreement-pending, .wf-window').count(), 0);
  await log.evaluate(el => { el.scrollTop = el.scrollHeight; });
  const initialTop = (await compose.boundingBox()).y;
  await feedback.locator('summary').click();
  await page.waitForFunction(() => {
    const log = document.querySelector('.cm-chat-log');
    return log.scrollHeight - log.scrollTop - log.clientHeight <= 1;
  });
  assert.equal((await compose.boundingBox()).y, initialTop, 'Opening feedback displaced the composer');
  const panel = await feedback.boundingBox();
  assert.ok(panel.width > 320, 'Feedback form must have room for Arabic labels');
  await draft.focus();
  await page.setViewportSize({width:393, height:480});
  await page.waitForSelector('html[data-nf-chat-keyboard]');
  const keyboardPlan = await plan.boundingBox();
  assert.ok(Math.abs(keyboardPlan.y + keyboardPlan.height - 480) <= 1);
  assert.ok((await log.boundingBox()).height > 80);
  assert.equal(await feedback.isVisible(), false);
  await page.setViewportSize({width:393, height:852});
  await draft.blur();
  await feedback.locator('summary').click();
  await draft.fill('مسودة');
  await page.waitForFunction(() => !document.querySelector('.cm-reading-restore'));
  await draft.focus();
  assert.ok(await page.evaluate(() => window.historyFormats > 0), 'History-render probe must see the mounted message');
  await page.evaluate(() => { window.historyFormats = 0; });
  for (const character of ' من رهام') await page.keyboard.insertText(character);
  assert.equal(await draft.inputValue(), 'مسودة من رهام');
  const formats = await page.evaluate(() => window.historyFormats);
  const pictures = new URL('../.tmp/chat-composer/', import.meta.url);
  await mkdir(pictures, { recursive: true });
  await page.locator('.cm-chat-compose').screenshot({ path: fileURLToPath(new URL('typing.png', pictures)) });

  await page.evaluate(() => {
    const key = 'nisfayn-local-chat-privacy-qa-composer';
    const rows = JSON.parse(localStorage.getItem(key));
    rows.push({ id: 'during-draft', body: 'رسالة أثناء الكتابة', sender: 'abdulrahman', createdAt: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(rows));
    window.dispatchEvent(new StorageEvent('storage', { key }));
  });
  await page.locator('[data-server-id="during-draft"]').waitFor();
  assert.equal(await draft.inputValue(), 'مسودة من رهام');
  await page.getByRole('button', { name: 'رجوع', exact: true }).click();
  await openChat.click();
  await draft.waitFor();
  assert.equal(await draft.inputValue(), 'مسودة من رهام');
  await draft.fill('م'.repeat(851));
  await page.locator('.cm-count').waitFor();
  await draft.fill('مسودة من رهام');
  await send.click();
  await page.locator('.cm-bubble.self p').filter({ hasText: 'مسودة من رهام' }).waitFor();
  assert.equal(await draft.inputValue(), '');
  assert.ok(await send.isDisabled());
  assert.deepEqual(errors, []);
  assert.equal(formats, 0, 'Typing re-rendered the chat history');
  console.log('100 messages, zero history renders during typing. Incoming message, draft recovery, counter and send passed.');
} finally {
  await browser?.close();
  await server.close();
}
