// Isolated browser check. Interview and account draft responses are synthetic.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import preferences from '../src/compatibility/catalog.json' with { type: 'json' };
import personality from '../src/compatibility/personality-catalog.json' with { type: 'json' };
import scenarios from '../src/interview/opening-scenarios.json' with { type: 'json' };
import { initialInterviewDocument } from '../api/_lib/interview.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NISFAYN_PLAYWRIGHT_MODULE ||
  'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output = resolve(root, '.tmp/interview-hybrid');
await mkdir(output, { recursive: true });

const fixture = `
  import React, { useEffect, useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { InterviewPanel } from '/src/interview/InterviewPanel';
  import { initializeDevicePreferences } from '/src/settings/preferences';
  import '/src/typography.css';
  import '/src/ambient.css';
  import '/src/design.css';
  import '/src/flows.css';
  import '/src/screens.css';
  import '/src/accessibility.css';
  initializeDevicePreferences();
  window.applied = [];
  function Fixture() {
    const [choices, setChoices] = useState(null);
    useEffect(() => {
      void fetch('/__hybrid-draft').then(response => response.json()).then(setChoices);
    }, []);
    if (!choices) return null;
    return <InterviewPanel open gender={new URLSearchParams(location.search).get('gender') === 'woman' ? 'woman' : 'man'} auth={{ testSession: 'isolated-browser-fixture' }} onboarding
      assessmentContext={Object.entries(choices).map(([id, values]) => ({ id, values }))}
      onStructuredDraftChange={next => {
        setChoices(next);
        void fetch('/__hybrid-draft', { method: 'POST', body: JSON.stringify(next) });
      }} onClose={() => {}} onApply={confirmed => window.applied.push(confirmed)} />;
  }
  createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const server = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  cacheDir: resolve(root, 'node_modules/.vite-interview-hybrid'),
  optimizeDeps: {
    entries: [],
    include: ['react', 'react-dom/client', 'react/jsx-runtime', 'lucide-react', '@capacitor/core', '@supabase/supabase-js', 'react-native-reanimated', 'react-native-worklets'],
  },
  server: { host: '127.0.0.1', port: 0, hmr: false },
  plugins: [{
    name: 'interview-hybrid-browser-fixture',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'virtual:interview-hybrid') return '\0interview-hybrid';
    },
    async load(id) {
      if (id === '\0interview-hybrid') {
        return (await transformWithEsbuild(fixture, 'fixture.tsx', { loader: 'tsx', jsx: 'automatic' })).code;
      }
    },
    configureServer(dev) {
      dev.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== '/__interview-hybrid') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end(await dev.transformIndexHtml(request.url,
          '<!doctype html><html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/@id/__x00__interview-hybrid"></script></body></html>'));
      });
    },
  }],
});

const firstId = 'preference:children_plan:self';
const firstPartnerId = 'preference:children_plan:partner';
const expectedIds = [
  ...preferences.dimensions.flatMap(({ id }) => [`preference:${id}:self`, `preference:${id}:partner`]),
  ...personality.map(({ id }) => `personality:${id}:self`),
].sort();
const opening = 'أرغب في الإنجاب وأفضّل شريكًا يرغب في الإنجاب. أستمتع كثيرًا بالتعمق في فكرة واحدة أكثر من التنقل بين مواضيع كثيرة.';
const proposal = {
  id: firstId, kind: 'preference', fieldId: 'children_plan', side: 'self', values: ['A'],
  summary: 'اقتراح من مقدمتك', needsClarification: false,
  evidence: [{ turnId: 'intro', quote: 'أرغب في الإنجاب' }],
};
const calls = [];
const errors = [];
let draft = {};
let benchmark = false;
let suggestionCount = 1;
const supported = [
  {...proposal, id:'personality:depth:self', kind:'personality', fieldId:'depth', values:['E'], evidence:[{turnId:'intro',quote:'أستمتع كثيرًا بالتعمق في فكرة واحدة أكثر من التنقل بين مواضيع كثيرة'}]},
  proposal,
  {...proposal, id:firstPartnerId, side:'partner', evidence:[{turnId:'intro',quote:'أفضّل شريكًا يرغب في الإنجاب'}]},
];
let snapshot = { document: initialInterviewDocument(true), revision: 1, coverage: { answered: 0, required: 44 } };
let releaseOpening;
const openingResponse = new Promise(resolveOpening => { releaseOpening = resolveOpening; });
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, locale: 'ar-SA', reducedMotion: 'reduce' });
  await context.route('**/*', async route => {
    const { hostname, pathname } = new URL(route.request().url());
    if (hostname !== '127.0.0.1') return route.abort();
    if (pathname === '/__hybrid-draft') {
      if (route.request().method() === 'POST') draft = JSON.parse(route.request().postData());
      return route.fulfill({ json: draft });
    }
    if (pathname !== '/api/interview') return route.continue();
    const payload = route.request().postDataJSON();
    calls.push(payload);
    switch (payload.action) {
      case 'load': break;
      case 'draft':
        snapshot = { ...snapshot, revision: snapshot.revision + 1, document: { ...snapshot.document, draftAnswer: payload.answer } };
        break;
      case 'answer':
        assert.equal(payload.answer, opening);
        assert.equal(payload.hybrid, true);
        assert.equal(payload.assessmentContext, undefined);
        await openingResponse;
        snapshot = { revision: snapshot.revision + 1, carryForwardIds:supported.slice(0,suggestionCount).map(p=>p.id), coverage: { answered: suggestionCount, required: 44 }, document: {
          ...snapshot.document, status: 'review', currentQuestion: null, pendingAnalysis: false, draftAnswer: '',
          turns: [{ id: 'intro', topic: 'intent', question: snapshot.document.currentQuestion.text, answer: opening, skipped: false }],
          lastMode: 'luna', lastRequestId: payload.requestId, proposals:supported.slice(0,suggestionCount),
        } };
        break;
      case 'structuredConfirm':
        assert.deepEqual(payload.choices.map(({ id }) => id).sort(), expectedIds);
        assert.equal(payload.choices.find(({ id }) => id === firstId).values[0], benchmark ? 'A' : 'B');
        assert.equal(payload.choices.find(({ id }) => id === firstPartnerId).values[0], 'A');
        snapshot = { revision: snapshot.revision + 1, coverage: { answered: 44, required: 44 }, structuredConfirmation: true,
          document: { ...snapshot.document, status: 'confirmed', confirmed: payload.choices.map(choice => {
            const [kind, fieldId, side] = choice.id.split(':');
            return { ...proposal, ...choice, kind, fieldId, side };
          }) },
        };
        break;
      case 'choiceHelp':
        assert.equal(payload.fieldId, firstId);
        if (payload.answer === 'ممكن، لكن لسه ما حسمت قراري') assert.equal(payload.priorAnswer, 'ما أدري');
        return route.fulfill({ json: { document: null, revision: snapshot.revision, choiceHelp: !payload.answer
          ? { message: 'الخيارات تختلف في قرارك بشأن الأطفال.', explanations: { A: 'الإنجاب جزء من خطتك.', B: 'تفضّل حياة بدون أطفال.', C: 'تحتاج وقتًا لتحديد رغبتك.' } }
          : payload.answer === 'ما أدري'
            ? { message: 'تقصد إنك محتار أو إنك ما تبي أطفال؟', code: null }
            : { message: 'وصفت قرارًا ما حسمته إلى الآن.', code: 'C' } } });
      default: throw Error('Unexpected interview action: ' + payload.action);
    }
    return route.fulfill({ json: snapshot });
  });

  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(45000);
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__interview-hybrid`;
  const dialog = page.locator('.wi-dialog');
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('#wi-answer').getAttribute('maxlength'), '900');
  assert.match(await page.locator('#wi-answer-count').innerText(), /٩٠٠/);
  await page.locator('#wi-answer').fill(opening);
  await page.getByRole('button', { name: 'إرسال الرسالة', exact: true }).click();
  const card = page.locator('.wi-hybrid-card');
  assert.equal(await card.count(), 0);
  releaseOpening();
  await card.waitFor();
  const self = card.locator('fieldset').first();
  const portrait = page.locator('.wi-living-portrait');
  const fill = portrait.locator('.wi-portrait-mark i > span').first();
  const emptyFill = await fill.getAttribute('style');
  assert.deepEqual(calls.filter(({ action }) => action === 'answer').map(({ answer }) => answer), [opening]);
  const help = self.getByRole('button',{name:'مو عارف وش أختار؟'});
  await help.click();
  assert.equal(calls.filter(call => call.action === 'choiceHelp').length, 0);
  await self.getByRole('button', { name: 'اشرحي الخيارات' }).click();
  await self.getByText('الإنجاب جزء من خطتك.').waitFor();
  const description = self.getByLabel('أو قلها بطريقتك');
  const map = self.getByRole('button', { name: 'اقترحي أقرب خيار' });
  await description.fill('ما أدري');
  await map.click();
  await self.getByText('تقصد إنك محتار أو إنك ما تبي أطفال؟').waitFor();
  const accept = self.getByRole('button', { name: 'استخدم هذا الخيار' });
  assert.equal(await accept.count(), 0);
  await self.getByLabel('ردّ على لونا').fill('ممكن، لكن لسه ما حسمت قراري');
  await self.getByRole('button', { name: 'إرسال التوضيح' }).click();
  await accept.waitFor();
  await page.screenshot({ path: resolve(output, 'choice-help-390.png') });
  assert.equal(draft[firstId], undefined, 'A proposed option never writes to the draft');
  await accept.click();
  assert.deepEqual(draft[firstId], ['C']);
  assert.notEqual(await fill.getAttribute('style'), emptyFill);
  assert.equal(await card.locator('fieldset').getAttribute('data-side'), 'partner');
  assert.equal(draft[firstPartnerId], undefined);
  await portrait.locator(':scope > summary').click();
  await portrait.locator('.wi-portrait-theme > summary').first().click();
  const mirror = portrait.getByRole('combobox', { name:'الأطفال، في حياتي' });
  assert.equal(await mirror.inputValue(), 'C');
  await mirror.selectOption('B');
  await portrait.locator(':scope > summary').click();
  const inferred = card.locator('.wi-partner-default');
  assert.match(await inferred.innerText(), /اقتراح للشريك/);
  assert.equal(draft[firstPartnerId], undefined);
  await inferred.locator('summary').click();
  await inferred.locator('.wi-hybrid-option').first().click();
  assert.deepEqual(draft[firstPartnerId], ['A']);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.wi-hybrid').waitFor();
  assert.deepEqual(draft[firstId], ['B']);
  assert.deepEqual(draft[firstPartnerId], ['A']);
  const actionsBeforeCards = calls.length;
  await card.locator('.wi-hybrid-option').first().dispatchEvent('click',{detail:1,clientX:140,clientY:360});
  await card.locator('.wi-hybrid-option').first().dispatchEvent('click',{detail:2,clientX:140,clientY:360});
  assert.equal(draft['preference:residence_plan:self'],undefined,'Tap-through cannot answer the next self question');
  await page.getByRole('button',{name:'السابق',exact:true}).click();
  await page.getByRole('button',{name:'متابعة',exact:true}).click();
  let scaleChecked = false;
  for (let index = 0; index < 44 && await card.count(); index++) {
      const group = card.locator('fieldset').first();
      const scale = group.getByRole('slider');
      if (await scale.count()) {
        if (!scaleChecked) assert.equal(await scale.getAttribute('aria-valuetext'), 'لم تحدد إجابتك بعد');
        await scale.focus();
        await page.keyboard.press('Home');
        assert.equal(await scale.getAttribute('aria-valuetext'), 'لا يشبهني إطلاقًا');
        const before = await page.locator('.wi-hybrid-stage h1').innerText();
        const saved = JSON.stringify(draft);
        await page.keyboard.press('ArrowLeft');
        assert.equal(await page.locator('.wi-hybrid-stage h1').innerText(),before);
        assert.equal(JSON.stringify(draft),saved);
        if (!scaleChecked) {
          await page.screenshot({ path: resolve(output, 'personality-scale-390.png') });
          scaleChecked = true;
        }
        await page.keyboard.press('Enter');
      } else await group.locator('button').first().press('Space');
  }
  assert.equal(await card.count(), 0);
  assert.equal(scaleChecked, true);
  assert.equal(calls.length, actionsBeforeCards, 'Structured taps do not call the interview API');
  assert.equal(await page.locator('.wi-hybrid-batch').count(), 0);
  await page.screenshot({ path: resolve(output, 'review-390.png') });
  const review = page.locator('.wi-hybrid-review');
  assert.equal(await review.locator('select').count(),44);
  await review.locator('summary').first().click();
  const residenceSelf = review.getByRole('combobox',{name:'مدينة السكن، عنّي',exact:true});
  const residencePartner = review.getByRole('combobox',{name:/مدينة السكن، تفضيلي في الشريك/});
  assert.equal(await residencePartner.inputValue(),'B');
  await residenceSelf.selectOption('B');
  assert.equal(await residencePartner.inputValue(),'');
  await residenceSelf.selectOption('A');
  assert.match(await residencePartner.getAttribute('aria-label'),/اقتراح/);
  await residencePartner.selectOption('C');
  await residenceSelf.selectOption('B');
  assert.equal(await residencePartner.inputValue(),'C');
  assert.doesNotMatch(await residencePartner.getAttribute('aria-label'),/اقتراح/);
  const confirmation = page.getByRole('button', { name: 'اعتماد إجاباتي', exact: true });
  assert.equal(await confirmation.isDisabled(), false);
  assert.equal(calls.length, actionsBeforeCards, 'Reviewing the choices stays local');
  await confirmation.click();
  await page.locator('.wi-complete').waitFor();
  assert.deepEqual(calls.slice(actionsBeforeCards).map(({ action }) => action), ['structuredConfirm']);
  assert.equal(await page.evaluate(() => window.applied[0]?.length), 44);
  draft = {};
  snapshot = { document: initialInterviewDocument(true), revision: 1, coverage: { answered: 0, required: 44 } };
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#wi-answer').fill(opening);
  await page.getByRole('button', { name:'إرسال الرسالة', exact:true }).click();
  // The member still chooses their own response and their partner preference.
  await page.locator('.wi-hybrid-stage h1').filter({hasText:'الأطفال'}).waitFor();
  const callsBeforeEdit = calls.length;
  const suggestions = page.locator('.wi-hybrid-captured-review');
  await suggestions.locator(':scope > summary').click();
  const extracted = suggestions.getByRole('combobox', {name:'عمق الحوار، عن شخصيتي'});
  assert.equal(await extracted.inputValue(), 'E');
  await extracted.selectOption('C');
  assert.equal(await extracted.inputValue(), 'C');
  assert.deepEqual(draft['personality:depth:self'], ['C']);
  assert.equal(calls.length, callsBeforeEdit);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await suggestions.locator(':scope > summary').click();
  assert.equal(await extracted.inputValue(), 'C');
  // An explicit batch save includes only still-pending extractions.
  snapshot.document.proposals.push(proposal, { ...proposal, fieldId:'marriage_timeline', id:'preference:marriage_timeline:self', needsClarification:true });
  snapshot.carryForwardIds.push(firstId);
  await page.reload();
  await suggestions.locator(':scope > summary').click();
  await suggestions.getByText('من كلامك',{exact:true}).click();
  await suggestions.locator('q').filter({hasText:'أرغب في الإنجاب'}).waitFor();
  assert.deepEqual(draft,{ 'personality:depth:self':['C'] });
  const beforeBatch = calls.length;
  await suggestions.getByRole('button',{name:'اعتماد المقترحات في مسودتي'}).click();
  await page.waitForFunction(() => !document.querySelector('.wi-hybrid-captured-review')?.open);
  assert.deepEqual(draft,{ 'personality:depth:self':['C'], [firstId]:['A'] });
  assert.equal(calls.length,beforeBatch);
  assert.equal(await card.locator('fieldset').first().getByRole('button',{pressed:true}).count(),0);
  snapshot = {document:initialInterviewDocument(true),revision:1,coverage:{answered:0,required:44}};
  snapshot.document.currentQuestion = { topic:scenarios[0].topic, text:scenarios[0].clarification, suggestions:[] };
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#wi-answer').waitFor();
  assert.equal(await page.locator('#wi-answer').getAttribute('maxlength'),'700');
  assert.match(await page.locator('#wi-answer-count').innerText(),/٧٠٠/);
  // Two otherwise identical scripted assessments. One text entry or control activation counts as one action.
  benchmark = true;
  const trials = [];
  for (suggestionCount of [0, 1, 3]) {
    draft = {};
    snapshot = { document: initialInterviewDocument(true), revision: 1, coverage: { answered: 0, required: 44 } };
    await page.goto(url + '?gender=' + (suggestionCount === 1 ? 'woman' : 'man'));
    let actions = 0;
    const startCalls = calls.length;
    await page.locator('#wi-answer').fill(opening); actions++;
    await page.getByRole('button', {name:'إرسال الرسالة',exact:true}).click(); actions++;
    await card.waitFor();
    while (await card.count()) {
      assert.ok(actions < 60, 'Every activation must make progress');
      const group = card.locator('fieldset').first();
      const legend = await group.locator('legend').innerText();
      if (legend.includes('في حياتي') && (await page.locator('.wi-hybrid-stage h1').innerText()).includes('عمل')) {
        assert.match(legend, suggestionCount === 1 ? /ترغبين في العمل/ : /العمل|عمل|الزوجة/);
      }
      const scale = group.getByRole('slider');
      if (await scale.count()) await scale.click({position:{x:4,y:22}});
      else {
        // Distinct deliberate taps, outside the double-tap window.
        await page.waitForTimeout(360);
        await group.locator('button').first().click();
      }
      if (!suggestionCount && actions === 2) await page.screenshot({path:resolve(output,'partner-after.png')});
      actions++;
    }
    await confirmation.click(); actions++;
    await page.locator('.wi-complete').waitFor();
    assert.equal(await page.locator('.wi-confirmed-answers dd').count(), 2);
    assert.match(await page.locator('.wi-complete').innerText(), /٤٤ إجابة/);
    const requests = calls.slice(startCalls);
    const submitted = requests.find(call => call.action === 'structuredConfirm');
    const confirmed = submitted.choices;
    assert.equal(submitted.inferredPartnerIds.includes(firstPartnerId), suggestionCount !== 3);
    assert.equal(submitted.inferredPartnerIds.length, suggestionCount === 3 ? 8 : 9);
    assert.equal(confirmed.length,44);
    assert.equal(requests.filter(call => ['answer','retry','clarify','choiceHelp'].includes(call.action)).length,1);
    trials.push({ actions, confirmed });
  }
  assert.deepEqual(trials[0].confirmed, trials[1].confirmed);
  assert.deepEqual(trials[0].confirmed, trials[2].confirmed);
  assert.deepEqual(trials.map(trial => trial.actions),[38,37,36]);
  console.log('Assessment actions (zero / one / three supported suggestions):', trials.map(trial => trial.actions));
  assert.deepEqual(errors, []);
  console.log('PASS: iPhone 17 viewport, reviewed Luna response, saved draft, explicit partner choices, and one 44-field confirmation');
} finally {
  releaseOpening();
  await browser?.close();
  await server.close();
}
