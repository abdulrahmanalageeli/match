const { chromium } = require('C:/Users/timgo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const state = { actor: 'reham', matched: true, messages: [], read: {}, delivered: {}, profiles: {}, stage: 0, agree: {}, exclusive: false, exclusiveConsent: {}, call: null, callPermission: { status: 'accepted' }, seriousness: { status: 'accepted', womanSignedAt: '2026-11-06T00:00:00Z', deadline: '2026-12-01T00:00:00Z', days: 14 } };
    const notifications = [];
    await page.route('**/functions/v1/pair-test', async route => {
      const body = route.request().postDataJSON();
      if (body?.action === 'read') state.read.reham = state.messages.find(m => m.id === body.payload.id)?.createdAt;
      if (body?.action === 'step') {
        if (body.payload.stage === 1) {
          assert.equal(body.payload.exclusiveConsent, true);
          state.exclusiveConsent.reham = body.payload.agree;
          if (state.exclusiveConsent.reham && state.exclusiveConsent.abdulrahman) { state.stage = 1; state.exclusive = true; state.retiredFictional = true; }
        } else { state.agree.reham = body.payload.agree; if (state.agree.reham && state.agree.abdulrahman) { state.stage++; state.agree = {}; } }
      }
      if (body?.action === 'notifications_read') for (const n of notifications) if (body.payload.ids.includes(n.id)) n.readAt = new Date().toISOString();
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body?.action === 'notifications' ? notifications : { ...state, session: 'a'.repeat(64) }) });
    });
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5493');
    await page.getByRole('button', { name: /^رهام/ }).click();
    await page.getByRole('button', { name: 'دخول التجربة', exact: true }).click();
    await page.locator('.nf-tester-bar').waitFor({state:'attached'});
    state.messages.push({ id: 'new-1', sender: 'abdulrahman', body: 'اختبار تنبيه الرسائل', createdAt: new Date().toISOString() });
    await page.locator('.nf-activity-toast').filter({ hasText: 'رسائل من عبدالرحمن' }).waitFor();
    await page.locator('.nf-activity-toast .nf-activity-item').click();
    await page.getByRole('textbox', { name: 'رسالتك' }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.nf-activity-toast'));
    assert.match(await page.locator('.cm-journey-summary').innerText(), /التعارف الأول/);
    // Incoming messages in the already open chat should not produce duplicate popups.
    state.messages.push({ id: 'new-2', sender: 'abdulrahman', body: 'رسالة داخل المحادثة', createdAt: new Date(Date.now() + 1000).toISOString() });
    await page.getByText('رسالة داخل المحادثة', { exact: true }).waitFor();
    assert.equal(await page.locator('.nf-activity-toast').count(), 0);
    state.exclusiveConsent.abdulrahman = true;
    await page.locator('.cm-journey-summary[data-pending="true"]').waitFor();
    await page.locator('.nf-activity-toast').filter({ hasText: 'يقترح خطوة جديدة' }).waitFor();
    await page.getByRole('button', { name: 'إخفاء التنبيه', exact: true }).click();
    await page.locator('.cm-journey-summary').click();
    const consent = page.getByRole('button', { name: 'أوافق وأفعّل الالتزام الحصري', exact: true });
    assert.equal(await consent.isDisabled(), true);
    if (process.env.SCREENSHOT) await page.screenshot({path:process.env.SCREENSHOT.replace('.png','-warning.png')});
    await page.getByRole('checkbox', {name:/أفهم أن موافقتنا/}).check();
    await consent.click();
    await page.locator('.cm-journey-stages [aria-current="step"]').filter({ hasText: 'نقاش جاد' }).waitFor();
    assert.equal(state.stage, 1);
    assert.equal(state.exclusive,true);
    await page.getByRole('button', { name: 'اقتراح: الخطوة الرسمية أو العائلية', exact: true }).click();
    await page.getByRole('button', { name: 'سحب طلبي', exact: true }).waitFor();
    assert.equal(state.stage, 1, 'A single approval must not advance the shared stage');
    await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cm-journey-summary')?.textContent.includes('بانتظار الطرف الآخر'));
    await page.locator('.cm-chat-head .cm-exclusive-badge').waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT });
    // Real incoming visit metadata appears in the renamed tab and opens the visitor's profile.
    notifications.push({id:'visit-1',kind:'profile_visit',actor:'abdulrahman',createdAt:new Date().toISOString(),readAt:null,requestId:'tester-pair'});
    await page.locator('.cm-chat-head > button').first().click();
    await page.getByRole('button',{name:'الإشعارات',exact:true}).click();
    const visit = page.locator('.cm-notification-row').filter({hasText:'زيارة من عبدالرحمن'});
    await visit.waitFor();
    if (process.env.SCREENSHOT) await page.screenshot({path:process.env.SCREENSHOT.replace('.png','-feed.png')});
    await visit.click();
    await page.getByRole('button',{name:'العودة للإشعارات',exact:true}).waitFor();
    assert(notifications[0].readAt);
    assert.deepEqual(errors, []);
    console.log('PASS: message alert opens chat, read clears alert, open chat suppresses duplicates, journey request is visible, mutual acceptance advances, unilateral request waits. Mocked API only.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
