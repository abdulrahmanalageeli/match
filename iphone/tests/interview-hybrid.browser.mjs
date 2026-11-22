import archivedDimensions from '../src/compatibility/catalog-v3.json' with {type:'json'};
import archivedTraits from '../src/compatibility/personality-catalog-v1.json' with {type:'json'};
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
import openingPrompts from '../src/interview/opening-prompts.json' with { type: 'json' };
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
  import { InterviewEntry, InterviewPanel } from '/src/interview/InterviewPanel';
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
    const [showEntry, setShowEntry] = useState(new URLSearchParams(location.search).has('entry'));
    useEffect(() => {
      void fetch('/__hybrid-draft').then(response => response.json()).then(setChoices);
    }, []);
    if (!choices) return null;
    if (showEntry) return <InterviewEntry available open={() => setShowEntry(false)}/>;
    return <InterviewPanel open direct={location.hash === '#direct'} gender={new URLSearchParams(location.search).get('gender') === 'woman' ? 'woman' : 'man'} auth={{ testSession: 'isolated-browser-fixture' }} onboarding
      profileContext={new URLSearchParams(location.search).has('children') ? [
        {fieldId:'marriageBasics.childrenCount',values:[new URLSearchParams(location.search).get('children')],mode:null,exclude:false},
        {fieldId:'partnerCriteria.children',values:['none'],mode:new URLSearchParams(location.search).get('mode'),exclude:false},
      ] : undefined}
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
  ...preferences.dimensions.flatMap(({ id }) => id === 'residence_plan'
    ? ['preference:residence_plan:self']
    : [`preference:${id}:self`, `preference:${id}:partner`]),
  ...personality.map(({ id }) => `personality:${id}:self`),
].sort();
const opening = 'أرغب في الإنجاب وأفضّل شريكًا يرغب في الإنجاب. أحب كثيرًا أفهم وجهات نظر أو أفكار تختلف عن رأيي.';
const proposal = {
  id: firstId, kind: 'preference', fieldId: 'children_plan', side: 'self', values: ['A'],
  summary: 'اقتراح من مقدمتك', needsClarification: false,
  evidence: [{ turnId: 'intro', quote: 'أرغب في الإنجاب' }],
};
const calls = [];
const errors = [];
let draft = {};
let benchmark = false;
let openingExperience = false;
let expectedReceipt=expectedIds;
let resumedFamily=false;
let suggestionCount = 1;
const supported = [
  {...proposal, id:'personality:explore_views:self', kind:'personality', fieldId:'explore_views', values:['E'], evidence:[{turnId:'intro',quote:'أحب كثيرًا أفهم وجهات نظر أو أفكار تختلف عن رأيي'}]},
  proposal,
  {...proposal, id:firstPartnerId, side:'partner', evidence:[{turnId:'intro',quote:'أفضّل شريكًا يرغب في الإنجاب'}]},
];
let snapshot = { document: initialInterviewDocument(true), revision: 1, coverage: { answered: 0, required: expectedIds.length } };
let releaseOpening;
let openingResponse = new Promise(resolveOpening => { releaseOpening = resolveOpening; });
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
        if (openingExperience && payload.skip) {
          assert.equal(snapshot.document.currentQuestion.text,openingPrompts.nextStep);
          snapshot = {...snapshot, revision:snapshot.revision + 1,
            document:{...snapshot.document,status:'review',currentQuestion:null,lastRequestId:payload.requestId}};
          break;
        }
        assert.equal(payload.answer, opening);
        assert.equal(payload.hybrid, true);
        assert.equal(payload.assessmentContext, undefined);
        await openingResponse;
        snapshot = { revision: snapshot.revision + 1, carryForwardIds:supported.slice(0,suggestionCount).map(p=>p.id), coverage: { answered: suggestionCount, required: expectedIds.length }, document: {
          ...snapshot.document, status: 'review', currentQuestion: null, pendingAnalysis: false, draftAnswer: '',
          turns: [{ id: 'intro', topic: 'intent', question: snapshot.document.currentQuestion.text, answer: opening, skipped: false }],
          lastMode: 'luna', lastRequestId: payload.requestId, proposals:supported.slice(0,suggestionCount),
        } };
        if (openingExperience) {
          assert.equal(payload.openingFlow,true);
          snapshot.document.status = 'active';
          snapshot.document.currentQuestion = {topic:'intent',text:openingPrompts.nextStep,suggestions:[]};
        }
        break;
      case 'directConfirm':
      case 'structuredConfirm':
        assert.deepEqual(payload.choices.map(({ id }) => id).sort(), expectedReceipt);
        assert.equal(payload.choices.find(({ id }) => id === firstId).values[0], (payload.action === 'directConfirm' || (benchmark && !resumedFamily)) ? 'A' : 'B');
        assert.equal(payload.choices.find(({ id }) => id === firstPartnerId).values[0], 'A');
        snapshot = { revision: snapshot.revision + 1, coverage: { answered: expectedReceipt.length, required: expectedReceipt.length }, structuredConfirmation: true,
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
  await page.locator('.wi-typing').waitFor();
  assert.equal(await card.count(), 0, 'stay in the conversation until the introduction is analyzed');
  assert.equal(await dialog.getAttribute('data-reading'), 'true');
  assert.equal(calls.some(call => call.action === 'structuredConfirm'), false);
  releaseOpening();
  await page.locator('.wi-hybrid-captured-review').waitFor();
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
  await page.getByRole('button',{name:'السابق',exact:true}).click();
  assert.equal(await card.locator('fieldset').getAttribute('data-side'),'self');
  assert.equal(await card.getByRole('button',{pressed:true}).count(),1);
  await page.getByRole('button',{name:'متابعة',exact:true}).click();
  assert.equal(await card.locator('fieldset').getAttribute('data-side'),'partner');
  assert.equal(draft[firstPartnerId], undefined, 'Returning to the partner question must not fill it');
  await portrait.locator(':scope > summary').click();
  assert.equal(await portrait.locator('.wi-portrait-theme > summary small').first().innerText(),'قيد الإكمال');
  await portrait.locator('.wi-portrait-theme > summary').first().click();
  const mirror = portrait.getByRole('combobox', { name:'الأطفال، في حياتي' });
  assert.equal(await mirror.inputValue(), 'C');
  await mirror.selectOption('B');
  await portrait.locator(':scope > summary').click();
  const inferred = page.locator('.wi-partner-default');
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
  const title = page.locator('.wi-hybrid-stage h1');
  const timelineTitle = await title.innerText();
  await card.locator('.wi-hybrid-option').first().dispatchEvent('click',{detail:1,clientX:140,clientY:360});
  await card.locator('.wi-hybrid-option').first().dispatchEvent('click',{detail:2,clientX:140,clientY:360});
  assert.equal(draft['preference:residence_plan:self'],undefined,'Tap-through cannot answer the next self question');
  const residenceTitle = await title.innerText();
  assert.match(residenceTitle,/مدينة السكن/);
  await card.locator('.wi-hybrid-option').first().press('Space');
  const followingTitle = await title.innerText();
  assert.notEqual(followingTitle,residenceTitle,'Residence asks only about the member');
  const back = page.getByRole('button',{name:'السابق',exact:true});
  const forward = page.getByRole('button',{name:'متابعة',exact:true});
  await back.click();
  assert.equal(await title.innerText(),residenceTitle);
  await card.locator('.wi-hybrid-option').nth(1).press('Space');
  assert.equal(await title.innerText(),residenceTitle,'Editing does not advance unexpectedly');
  await back.click();
  assert.equal(await title.innerText(),timelineTitle);
  await forward.click();
  assert.equal(await title.innerText(),residenceTitle);
  assert.equal(await card.locator('.wi-hybrid-option').nth(1).getAttribute('aria-pressed'),'true');
  await forward.click();
  assert.equal(await title.innerText(),followingTitle);
  let testedKeyboardChoice = false;
  let sawCompletedGroup = false;
  for (let index = 0; index < expectedIds.length && await card.count(); index++) {
    if (!sawCompletedGroup && index > 0 && index % 5 === 0) {
      await portrait.locator(':scope > summary').click();
      sawCompletedGroup = await portrait.getByText('اكتملت الإجابات',{exact:true}).count() > 0;
      await portrait.locator(':scope > summary').click();
    }
    const group = card.locator('fieldset').first();
    const options = group.locator('.wi-hybrid-option');
    if (await group.getAttribute('data-compact') === 'true' && !testedKeyboardChoice) {
      assert.equal(await group.getByRole('slider').count(),0);
      assert.equal(await options.count(),5);
      assert.equal(await group.getByRole('button',{pressed:true}).count(),0);
      const before = await title.innerText();
      const saved = JSON.stringify(draft);
      await options.nth(2).focus();
      await page.keyboard.press('Tab');
      assert.equal(await title.innerText(),before);
      assert.equal(JSON.stringify(draft),saved,'Keyboard navigation does not choose a response');
      await page.screenshot({path:resolve(output,'personality-choices-390.png')});
      await options.nth(2).press('Enter');
      testedKeyboardChoice = true;
    } else await options.first().press('Space');
  }
  assert.equal(await card.count(), 0);
  assert.equal(testedKeyboardChoice, true);
  assert.equal(sawCompletedGroup, true);
  assert.equal(calls.length, actionsBeforeCards, 'Structured taps do not call the interview API');
  assert.equal(await page.locator('.wi-hybrid-batch').count(), 0);
  await page.screenshot({ path: resolve(output, 'review-390.png') });
  const review = page.locator('.wi-hybrid-review');
  assert.equal(await page.locator('.wi-luna-steps [aria-current=step]').innerText(),'المراجعة');
  assert.match(await review.locator('summary').first().innerText(),/الأطفال/);
  assert.equal(await review.locator('select').count(),expectedIds.length);
  await review.locator('summary').first().click();
  const residenceSelf = review.getByRole('combobox',{name:'مدينة السكن، عنّي',exact:true});
  const residencePartner = review.getByRole('combobox',{name:/مدينة السكن، تفضيلي في الشريك/});
  assert.equal(await residencePartner.count(),0);
  assert.equal(await residenceSelf.inputValue(),'B');
  await residenceSelf.selectOption('C');
  assert.equal(await residenceSelf.inputValue(),'C');
  const confirmation = page.getByRole('button', { name: 'اعتماد إجاباتي', exact: true });
  assert.equal(await confirmation.isDisabled(), false);
  assert.equal(calls.length, actionsBeforeCards, 'Reviewing the choices stays local');
  await confirmation.click();
  await page.locator('.wi-complete').waitFor();
  await page.screenshot({path:resolve(output,'confirmed.png'),animations:'disabled'});
  assert.deepEqual(calls.slice(actionsBeforeCards).map(({ action }) => action), ['structuredConfirm']);
  assert.equal(await page.evaluate(() => window.applied[0]?.length), expectedIds.length);
  draft = {};
  snapshot = { document: initialInterviewDocument(true), revision: 1, coverage: { answered: 0, required: expectedIds.length } };
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#wi-answer').fill(opening);
  await page.getByRole('button', { name:'إرسال الرسالة', exact:true }).click();
  // The member still chooses their own response and their partner preference.
  await page.locator('.wi-hybrid-stage h1').filter({hasText:'الأطفال'}).waitFor();
  const callsBeforeEdit = calls.length;
  const suggestions = page.locator('.wi-hybrid-captured-review');
  await suggestions.locator(':scope > summary').click();
  const extracted = suggestions.getByRole('combobox', {name:'وجهات النظر، عن شخصيتي'});
  assert.equal(await extracted.inputValue(), 'E');
  await extracted.selectOption('C');
  assert.equal(await extracted.inputValue(), 'C');
  assert.deepEqual(draft['personality:explore_views:self'], ['C']);
  assert.equal(calls.length, callsBeforeEdit);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await suggestions.locator(':scope > summary').click();
  assert.equal(await extracted.inputValue(), 'C');
  const settled = page.locator('.wi-opening-result');
  assert.equal(Number(await settled.getAttribute('data-pending')),0,'a corrected suggestion cannot remain pending after reload');
  assert.equal(Number(await settled.getAttribute('data-matched')),0,'a corrected manual answer must not be credited to Luna');
  // An explicit batch save includes only still-pending extractions.
  snapshot.document.proposals.push(proposal, { ...proposal, fieldId:'marriage_timeline', id:'preference:marriage_timeline:self', needsClarification:true });
  snapshot.carryForwardIds.push(firstId);
  await page.reload();
  await suggestions.locator(':scope > summary').click();
  await suggestions.getByText('من كلامك',{exact:true}).click();
  await suggestions.locator('q').filter({hasText:'أرغب في الإنجاب'}).waitFor();
  assert.deepEqual(draft,{ 'personality:explore_views:self':['C'] });
  const beforeBatch = calls.length;
  await suggestions.getByRole('button',{name:'اعتماد المقترحات في مسودتي'}).click();
  await page.waitForFunction(() => !document.querySelector('.wi-hybrid-captured-review')?.open);
  assert.deepEqual(draft,{ 'personality:explore_views:self':['C'], [firstId]:['A'] });
  assert.equal(Number(await settled.getAttribute('data-pending')),0);
  assert.equal(Number(await settled.getAttribute('data-matched')),1,'only the one matching saved answer receives credit');
  assert.equal(calls.length,beforeBatch);
  assert.equal(await card.locator('fieldset').first().getByRole('button',{pressed:true}).count(),0);
  snapshot = {document:initialInterviewDocument(true),revision:1,coverage:{answered:0,required:expectedIds.length}};
  snapshot.document.currentQuestion = { topic:scenarios[0].topic, text:scenarios[0].clarification, suggestions:[] };
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#wi-answer').waitFor();
  assert.equal(await page.locator('#wi-answer').getAttribute('maxlength'),'700');
  assert.match(await page.locator('#wi-answer-count').innerText(),/٧٠٠/);
  const guidedChoices = calls.find(call => call.action === 'structuredConfirm').choices;
  draft = Object.fromEntries(guidedChoices.map(({ id, values }) => [id, values]));
  delete draft[firstId];
  delete draft[firstPartnerId];
  snapshot = { document: initialInterviewDocument(true), revision: 1, coverage: { answered: 0, required: expectedIds.length } };
  const directStart = calls.length;
  await page.goto(url + '#direct');
  await page.reload({waitUntil:'domcontentloaded'});
  await card.waitFor();
  assert.equal(await page.locator('#wi-answer').count(), 0);
  await card.locator('.wi-hybrid-option').first().click();
  assert.equal(await card.locator('fieldset[data-side="partner"]').count(), 0,
    'A definite children answer must not open a mandatory partner field');
  const childrenSuggestion = page.locator('.wi-partner-default');
  assert.match(await childrenSuggestion.locator('summary').innerText(), /اقتراح للشريك.*تعديل/s);
  assert.equal(await childrenSuggestion.getAttribute('open'), null);
  assert.equal(draft[firstPartnerId], undefined, 'Inferred values stay out of the explicit draft');
  await page.reload({waitUntil:'domcontentloaded'});
  await confirmation.waitFor();
  assert.equal(await confirmation.isEnabled(), true);
  await confirmation.click();
  await page.locator('.wi-complete').waitFor();
  assert.deepEqual(calls.slice(directStart).map(call => call.action), ['load', 'load', 'directConfirm']);
  assert.equal(await page.evaluate(() => window.applied[0]?.length), expectedIds.length);
  assert.deepEqual(calls.at(-1).inferredPartnerIds,[firstPartnerId]);
  // Otherwise identical scripted assessments. One text entry or control activation counts as one action.
  benchmark = true;
  const trials = [];
  for (suggestionCount of [-1, 0, 1, 3]) {
    const directTrial = suggestionCount === -1;
    draft = {};
    snapshot = { document: initialInterviewDocument(true), revision: 1, coverage: { answered: 0, required: expectedIds.length } };
    await page.goto(url + '?gender=' + (suggestionCount === 1 ? 'woman' : 'man') + (directTrial ? '#direct' : ''));
    let actions = 0;
    const startCalls = calls.length;
    if (!directTrial) {
      await page.locator('#wi-answer').fill(opening); actions++;
      await page.getByRole('button', {name:'إرسال الرسالة',exact:true}).click(); actions++;
    }
    await card.waitFor();
    if (!directTrial) {
      const receipt = page.locator('.wi-opening-result:visible');
      assert.equal(await receipt.count(),1);
      assert.equal(Number(await receipt.getAttribute('data-pending')),suggestionCount);
      assert.equal(Number(await receipt.getAttribute('data-matched')),0);
      assert.ok((await receipt.innerText()).trim());
      if (suggestionCount === 0 || suggestionCount === 3) {
        await page.screenshot({path:resolve(output,'opening-result-'+suggestionCount+'.png'),animations:'disabled'});
      }
    }
    while (await card.count()) {
      assert.ok(actions < 60, 'Every activation must make progress');
      const group = card.locator('fieldset').first();
      const legend = await group.locator('legend').innerText();
      if (legend.includes('في حياتي') && (await page.locator('.wi-hybrid-stage h1').innerText()).includes('عمل')) {
        assert.match(legend, suggestionCount === 1 ? /ترغبين في العمل/ : /العمل|عمل|الزوجة/);
      }
      // Use the same explicit personality value as the carried-forward fixture.
      const options = group.locator('.wi-hybrid-option');
      await page.waitForTimeout(360);
      if (await group.getAttribute('data-compact') === 'true') await options.last().click();
      else await options.first().click();
      if (!suggestionCount && actions === 2) await page.screenshot({path:resolve(output,'partner-after.png')});
      actions++;
    }
    await confirmation.click(); actions++;
    await page.locator('.wi-complete').waitFor();
    assert.equal(await page.locator('.wi-confirmed-answers dd').count(), 2);
    assert.match(await page.locator('.wi-complete').innerText(), /٤٦ إجابة/);
    const requests = calls.slice(startCalls);
    const submitted = requests.find(call => call.action === (directTrial ? 'directConfirm' : 'structuredConfirm'));
    const confirmed = submitted.choices;
    assert.equal(submitted.inferredPartnerIds.includes(firstPartnerId), suggestionCount !== 3);
    assert.equal(submitted.inferredPartnerIds.length, suggestionCount === 3 ? 8 : 9);
    assert.equal(confirmed.length,expectedIds.length);
    assert.equal(requests.filter(call => ['answer','retry','clarify','choiceHelp'].includes(call.action)).length,directTrial ? 0 : 1);
    trials.push({ actions, confirmed });
  }
  assert.deepEqual(trials[0].confirmed, trials[1].confirmed);
  assert.deepEqual(trials[0].confirmed, trials[2].confirmed);
  assert.deepEqual(trials[0].confirmed, trials[3].confirmed);
  assert.deepEqual(trials.map(trial => trial.actions),[38,40,39,38]);
  console.log('Assessment actions (direct / guided zero / one / three supported suggestions):', trials.map(trial => trial.actions));
  // Resume the same confirmed answers through the real panel with different family facts.
  const reviewedDoc={...snapshot.document,status:'review',proposals:[],confirmed:[],currentQuestion:null};
  resumedFamily=true;
  draft=Object.fromEntries(trials[0].confirmed.map(row=>[row.id,row.values]));
  draft[firstId]=['B'];
  for(const side of ['self','partner']) delete draft['preference:parenting_approach:'+side];
  expectedReceipt=expectedIds.filter(id=>!id.startsWith('preference:parenting_approach:'));
  snapshot={revision:1,document:reviewedDoc,coverage:{answered:0,required:expectedReceipt.length}};
  await page.goto(url+'?children=0&mode=require');
  await page.locator('.wi-hybrid-review').waitFor();
  assert.equal(await page.locator('.wi-hybrid-review select').count(),expectedReceipt.length);
  await confirmation.click();
  await page.locator('.wi-complete').waitFor();
  assert.equal(snapshot.document.confirmed.length,expectedReceipt.length);

  expectedReceipt=expectedIds;
  draft={}; // A new device recovers the completed fields directly from the receipt.
  await page.goto(url+'?children=0&mode=prefer');
  for (const side of ['self','partner']) {
    const option=card.locator('fieldset').first().getByRole('button').first();
    await option.waitFor();
    await page.waitForTimeout(380);
    await option.click();
  }
  await confirmation.click();
  await page.locator('.wi-complete').waitFor();
  assert.equal(snapshot.document.confirmed.length,expectedIds.length);

  resumedFamily=false;
  const legacyIds=[...archivedDimensions.dimensions.flatMap(d=>['self','partner'].map(side=>'preference:'+d.id+':'+side)),
    ...archivedTraits.map(t=>'personality:'+t.id+':self')];
  draft=Object.fromEntries(legacyIds.map(id=>[id,['A']]));
  expectedReceipt=legacyIds.sort();
  snapshot={revision:1,document:{...reviewedDoc,promptVersion:'wudayn-interview-4'},coverage:{answered:0,required:44}};
  await page.goto(url+'?legacy');
  await page.locator('.wi-hybrid-review').waitFor();
  assert.equal(await page.locator('.wi-hybrid-review select').count(),44);
  await confirmation.click();
  await page.locator('.wi-complete').waitFor();
  assert.equal(await page.locator('.wi-confirmed-answers li').count(),44);
  console.log('PASS: reviewed 44 with a strict child-free preference, reopened both parenting questions after relaxing it, and resumed a 44-answer legacy receipt');

  openingExperience = true;
  openingResponse = new Promise(resolveOpening => { releaseOpening = resolveOpening; });
  draft = {};
  snapshot = {document:initialInterviewDocument(true),revision:1,coverage:{answered:0,required:expectedIds.length}};
  await page.goto(url + '?entry');
  const start = page.getByRole('button',{name:'ابدأ الحوار مع لونا',exact:true});
  await start.waitFor();
  assert.equal(await page.locator('.wi-entry button').count(),1);
  await start.click();
  await page.getByRole('heading',{name:/ابدأ من قصتك/}).waitFor();
  assert.equal(await page.locator('.wi-luna-steps [aria-current=step]').innerText(),'قصتك');
  await page.emulateMedia({reducedMotion:'no-preference'});
  const typedWord = page.locator('.wi-current-question .wi-type-word').first();
  const wordAnimation = () => typedWord.evaluate(el => getComputedStyle(el).animationName);
  assert.equal(await wordAnimation(), 'wi-type-rtl');
  const typewriterMoves = await page.locator('.wi-current-question .wi-type-word').last().evaluate(el => {
    const animation = el.getAnimations().find(item => item.animationName === 'wi-type-rtl');
    if (!animation || !animation.effect) return false;
    const {delay, duration} = animation.effect.getTiming();
    animation.pause();
    animation.currentTime = delay;
    const start = getComputedStyle(el).clipPath;
    animation.currentTime = delay + Number(duration);
    const end = getComputedStyle(el).clipPath;
    animation.play();
    return start !== end;
  });
  assert.ok(typewriterMoves,'the Arabic typewriter changes the rendered clipping position');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await wordAnimation(), 'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.clock.install();
  await page.evaluate(() => document.fonts.ready);
  const example = page.getByRole('button',{name:'شوف كيف تختصر الأسئلة'});
  await page.locator('.wi-chat[data-opening]').waitFor();
  const openingGap = await page.evaluate(() => document.querySelector('.wi-composer').getBoundingClientRect().top -
    document.querySelector('.wi-prompt-benefit').getBoundingClientRect().bottom);
  assert.ok(openingGap >= 0 && openingGap <= 32, 'The reply area should immediately follow the opening question');
  await page.screenshot({path:resolve(output,'opening-compact.png'),animations:'disabled'});
  await page.setViewportSize({width:320,height:568});
  await page.evaluate(() => { document.documentElement.dataset.nfText='large'; });
  await page.emulateMedia({reducedMotion:'reduce'});
  const layout = await page.locator('.wi-chat').evaluate(chat => ({
    overflow:chat.scrollWidth > chat.clientWidth,
    font:parseFloat(getComputedStyle(chat.querySelector('.wi-opening-benefit')).fontSize),
    labels:[...chat.querySelectorAll('.wi-luna-steps li')].filter(label=>label.getBoundingClientRect().width>0).length,
    motion:getComputedStyle(chat.querySelector('.wi-example-panel')).transitionDuration
  }));
  assert.equal(layout.overflow,false);
  assert.ok(layout.font >= 16);
  assert.equal(layout.labels,3);
  assert.equal(parseFloat(layout.motion),0);
  await page.locator('#wi-answer').focus();
  await page.locator('#wi-answer').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('#wi-answer').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));
  await page.screenshot({path:resolve(output,'opening-320-large-reduced.png'),animations:'disabled'});
  await page.locator('#wi-answer').blur();
  await page.setViewportSize({width:402,height:874});
  await page.evaluate(() => { delete document.documentElement.dataset.nfText; document.querySelector('.wi-chat').scrollTop=0; });
  await page.emulateMedia({reducedMotion:'no-preference'});
  await example.click();
  assert.equal(await example.getAttribute('aria-expanded'),'true');
  await page.clock.runFor(320);
  await page.screenshot({path:resolve(output,'opening-example.png')});
  await page.clock.fastForward(10_000);
  await example.getAttribute('aria-expanded').then(value=>assert.equal(value,'false'));
  await example.click();
  await example.click();
  assert.equal(await example.getAttribute('aria-expanded'),'false');
  await page.clock.runFor(320);
  await page.screenshot({path:resolve(output,'opening-saudia.png'), animations:'disabled'});
  await page.locator('#wi-answer').fill(opening);
  await page.getByRole('button',{name:'إرسال الرسالة',exact:true}).click();
  await page.locator('.wi-typing').waitFor();
  assert.equal(await card.count(), 0, 'no questionnaire card before the follow-up reply');
  releaseOpening();
  await page.getByRole('heading',{name:'كيف تتصوّر التعارف الجاد؟'}).waitFor();
  assert.equal(await card.count(), 0);
  assert.equal(await dialog.getAttribute('data-reading'), null);
  assert.equal(await page.locator('.wi-bubble-history .wi-type-word').count(), 0);
  assert.equal(await wordAnimation(), 'wi-type-rtl');
  assert.equal(await page.locator('#wi-answer').inputValue(),'');
  assert.equal(await page.locator('.wi-chat-suggestions').count(),0);
  await page.screenshot({path:resolve(output,'opening-next-step.png'), animations:'disabled'});
  const openingReceipt = page.locator('.wi-opening-result:visible');
  assert.equal(Number(await openingReceipt.getAttribute('data-pending')),suggestionCount);
  const insight = page.locator('.wi-opening-insights');
  await insight.locator('summary').click();
  assert.deepEqual(await insight.locator('q').allTextContents(),supported.slice(0,suggestionCount).map(p=>p.evidence[0].quote));
  await page.screenshot({path:resolve(output,'opening-evidence.png'),animations:'disabled'});
  const answersBeforeResume = calls.filter(call=>call.action==='answer').length;
  await page.goto(url+'?resumed');
  await insight.locator('summary').waitFor();
  assert.equal(await insight.locator('q').count(),suggestionCount);
  assert.equal(calls.filter(call=>call.action==='answer').length,answersBeforeResume);
  await page.setViewportSize({width:320,height:640});
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await insight.evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.ok(await dialog.evaluate(el=>el.scrollWidth <= el.clientWidth + 1));
  await page.getByRole('button',{name:'تخطّي السؤال'}).click();
  await card.waitFor();
  assert.equal(await page.locator('.wi-luna-steps [aria-current=step]').innerText(),'اختياراتك');
  assert.ok(calls.at(-1).skip);
  const field = card.locator('fieldset').first();
  const entryMotion = async () => field.evaluate(el => {
    const animation = el.getAnimations().find(item=>item.animationName==='wi-question-enter');
    if (!animation) return null;
    animation.pause();
    animation.currentTime = 0;
    const start = new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;
    animation.finish();
    const settled = getComputedStyle(el).transform;
    const end = settled === 'none' ? 0 : new DOMMatrixReadOnly(settled).m41;
    return {start,end};
  });
  assert.equal(await entryMotion(),null,'system reduced motion suppresses card movement');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>{document.documentElement.dataset.nfMotion='reduced'});
  assert.equal(await entryMotion(),null,'app reduced motion suppresses card movement');
  await page.evaluate(()=>{document.documentElement.dataset.nfMotion='system'});
  const pageScroll = await page.evaluate(()=>window.scrollY);
  await field.locator('.wi-hybrid-option').first().press('Enter');
  const forwardMotion = await entryMotion();
  assert.ok(forwardMotion && forwardMotion.start < 0 && forwardMotion.end === 0,'new question animates into its final RTL position');
  await back.click();
  const backMotion = await entryMotion();
  assert.ok(backMotion && backMotion.start > 0 && backMotion.end === 0,'Back reverses the card transition');
  assert.equal(await page.evaluate(()=>window.scrollY),pageScroll,'question navigation leaves the outer page scroll unchanged');
  console.log('PASS: timed example and optional free-text next step');
  assert.deepEqual(errors, []);
  console.log('PASS: iPhone 17 viewport, reviewed Luna response, saved draft, explicit partner choices, and one 46-field confirmation');
} finally {
  releaseOpening();
  await browser?.close();
  await server.close();
}
