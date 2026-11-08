/*
 * Run against a dedicated Vite server (no real credentials, API or microphone):
 *   npm run dev -- --host 127.0.0.1 --port 5187 --strictPort --mode demo
 *   node tests/voice-provider.test.cjs
 * PLAYWRIGHT_MODULE may point to an existing Playwright install; CHROME_PATH and
 * NISFAYN_TEST_URL are optional. The actual VoiceCallsProvider runs in Chromium;
 * only its API/transport imports are intercepted. No production test hooks.
 */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.NISFAYN_TEST_URL || 'http://127.0.0.1:5187';
const sourceMock = `
  export const callProblem = error => error?.message || 'Fixture error';
  export const voiceSource = owner => ({
    start: (...args) => window.__voiceRace.request('start', owner, args),
    state: (...args) => window.__voiceRace.request('state', owner, args),
    act: (id, action) => window.__voiceRace.request(action, owner, [id]),
    credentials: (...args) => window.__voiceRace.request('credentials', owner, args),
  });
`;
const transportMock = `
  export const nativeVoice = false;
  export async function prepareVoiceTransport() {}
  export function createVoiceTransport(events) {
    const probe = window.__voiceRace;
    const id = ++probe.transportCount; probe.events=events; probe.allEvents.push(events);
    probe.transportLog.push({ method:'create', id });
    return {
      async join(value,initiallyMuted=false) { probe.transportLog.push({ method:'join', id, callId:value.callId,initiallyMuted }); if(probe.joinFailures>0){probe.joinFailures--;throw new TypeError('Failed to fetch');} events.peer(true); },
      async leave() { probe.transportLog.push({ method:'leave', id }); },
      async mute(value) {probe.transportLog.push({method:'mute',value});}, async speaker() {}, async renew() {probe.transportLog.push({method:'renew'});}, play() {},
      async resume() {probe.transportLog.push({method:'resume',id});return !probe.resumeNeedsRejoin;},
    };
  }
`;

async function fixture(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [], forbidden = [];
  page.setDefaultTimeout(6000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/supabase\.(co|in)|agora-rtc-sdk|voice-token/i.test(request.url())) forbidden.push(request.url()); });
  await page.route(/\/src\/voice\/source\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: sourceMock }));
  await page.route(/\/src\/voice\/transport\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: transportMock }));
  await page.addInitScript(() => {
    let serial = 0;
    const jobs = new Map(), queues = new Map();
    const probe = window.__voiceRace = {
      apiLog: [], transportLog: [], transportCount: 0, allEvents: [], watchers: new Set(), server: null,
      call(id, status = 'ringing', direction = 'incoming') {
        return { id, requestId:'request-fixture', status, direction, person:{id:'peer-fixture',alias:'اختبار'},
          createdAt:new Date().toISOString(), ringingUntil:new Date(Date.now()+45000).toISOString(),
          acceptedAt:status==='active'?new Date().toISOString():null, endedAt:null, endReason:null };
      },
      hold(method) {
        const id = ++serial;
        let resolve, reject;
        const promise = new Promise((yes,no) => { resolve=yes; reject=no; });
        jobs.set(id,{promise,resolve,reject,called:false});
        queues.set(method,[...(queues.get(method)||[]),id]);
        return id;
      },
      requested(id) { return jobs.get(id)?.called || false; },
      complete(id, value) { jobs.get(id).resolve(value); },
      reject(id) { jobs.get(id).reject(new Error('Fixture lost start response')); },
      refresh() { for(const listener of this.watchers)listener(); },
      background() {
        Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
        document.dispatchEvent(new Event('visibilitychange'));
      },
      foreground() {
        Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
        document.dispatchEvent(new Event('visibilitychange'));
      },
      async request(method,owner,args) {
        this.apiLog.push({method,owner,args});
        const queue=queues.get(method);
        if(queue?.length) { const job=jobs.get(queue.shift()); job.called=true; return job.promise; }
        if(method==='state'){if(this.stateFailures>0){this.stateFailures--;throw new TypeError('Failed to fetch');}return owner==='owner-a'?this.server:null;}
        if(method==='start')return this.call(args[1],'ringing','outgoing');
        if(method==='accept')return this.call(args[0],'active');
        if(method==='credentials')return {callId:args[0],appId:'fixture',channel:'fixture',uid:17,token:'fixture-token',expiresAt:'2099-01-01'};
        return {...this.call(args[0],'ended'),endedAt:new Date().toISOString(),endReason:'ended'};
      },
    };
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{throw new Error('Race tests must never use a microphone');};
  });
  await page.goto(`${url}/tests/voice-provider-harness.html`);
  await page.waitForFunction(() => window.__voiceRace.apiLog.some(entry => entry.method === 'state'));
  const hold = method => page.evaluate(method => window.__voiceRace.hold(method), method);
  const requested = id => page.waitForFunction(id => window.__voiceRace.requested(id), id);
  const flush = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 30)))));
  const button = name => page.getByRole('button', { name, exact:true });
  async function incoming() {
    await page.evaluate(() => { const p=window.__voiceRace; p.server=p.call('incoming-fixture'); p.refresh(); });
    await button('قبول المكالمة').waitFor();
  }
  async function assertNoJoin() {
    await flush();
    assert.equal(await page.evaluate(() => window.__voiceRace.transportLog.filter(entry=>entry.method==='join').length),0,'late response must not join audio');
  }
  async function dispose() {
    assert.deepEqual(errors,[],'browser runtime errors');
    assert.deepEqual(forbidden,[],'unexpected live SDK/API request');
    await context.close();
  }
  return {page,hold,requested,flush,button,incoming,assertNoJoin,dispose};
}

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const cases=[];
  const run=async(name,test)=>{
    if(process.env.VOICE_CASE&&!new RegExp(process.env.VOICE_CASE).test(name))return;
    const f=await fixture(browser);
    try {await test(f);await f.dispose();cases.push({name,status:'passed'});console.log('PASS',name);}
    catch(error){cases.push({name,status:'failed',error:error.message});console.error('FAIL',name,error.message);await f.page.context().close();}
  };
  try {
    for(const dismiss of [false,true])await run(`delayed start after explicit cancellation${dismiss?' and dismissal':''}`,async f=>{
      const pending=await f.hold('start');
      await f.page.locator('#start-fixture').click();await f.requested(pending);
      await f.page.getByRole('dialog').press('Escape');
      await f.button('العودة للمحادثة').waitFor();
      if(dismiss)await f.button('العودة للمحادثة').click();
      await f.page.evaluate(id=>{const p=window.__voiceRace;const clientId=p.apiLog.find(x=>x.method==='start').args[1];p.complete(id,p.call(clientId,'active','outgoing'));},pending);
      await f.assertNoJoin();
      assert.equal(await f.page.locator('.nf-call[open]').count(),dismiss?0:1);
      if(!dismiss)await f.button('العودة للمحادثة').waitFor();
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.apiLog.filter(x=>x.method==='end').length>=2),true,'late server call must be ended');
    });
    await run('delayed start recovery after explicit cancellation and dismissal',async f=>{
      const pending=await f.hold('start');await f.page.locator('#start-fixture').click();await f.requested(pending);
      const recovery=await f.hold('state');
      await f.page.getByRole('dialog').press('Escape');await f.button('العودة للمحادثة').click();
      await f.page.evaluate(id=>window.__voiceRace.reject(id),pending);await f.requested(recovery);
      await f.page.evaluate(id=>{const p=window.__voiceRace;p.complete(id,p.call('recovered-fixture','active','outgoing'));},recovery);
      await f.assertNoJoin();assert.equal(await f.page.locator('.nf-call[open]').count(),0);
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.apiLog.some(x=>x.method==='end'&&x.args[0]==='recovered-fixture')),true);
    });
    await run('delayed active state cannot resurrect a hung-up call',async f=>{
      await f.incoming();await f.button('قبول المكالمة').click();await f.page.getByText('متصل الآن',{exact:true}).waitFor();
      const pending=await f.hold('state');await f.page.evaluate(()=>window.__voiceRace.refresh());await f.requested(pending);
      await f.button('إنهاء').click();await f.button('العودة للمحادثة').waitFor();
      await f.page.evaluate(id=>{const p=window.__voiceRace;p.complete(id,p.call('incoming-fixture','active'));},pending);
      await f.flush();await f.button('العودة للمحادثة').waitFor();
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.transportLog.filter(x=>x.method==='join').length),1,'only original transport may join');
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.transportLog.some(x=>x.method==='leave')),true);
    });
    await run('delayed accept after provider unmount never joins',async f=>{
      await f.incoming();const pending=await f.hold('accept');await f.button('قبول المكالمة').click();await f.requested(pending);
      await f.page.evaluate(()=>window.__voiceRace.changeOwner('owner-b'));
      await f.page.evaluate(id=>{const p=window.__voiceRace;p.complete(id,p.call('incoming-fixture','active'));},pending);
      await f.assertNoJoin();assert.equal(await f.page.locator('.nf-call[open]').count(),0);
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.apiLog.filter(x=>x.method==='end').length>=2),true);
    });
    await run('late credentials after owner remount never join or publish',async f=>{
      await f.incoming();const pending=await f.hold('credentials');await f.button('قبول المكالمة').click();await f.requested(pending);
      await f.page.evaluate(()=>window.__voiceRace.changeOwner('owner-b'));
      await f.page.waitForFunction(()=>window.__voiceRace.apiLog.some(x=>x.method==='state'&&x.owner==='owner-b'));
      await f.page.evaluate(id=>window.__voiceRace.complete(id,{callId:'incoming-fixture',appId:'fixture',channel:'fixture',uid:17,token:'fixture',expiresAt:'2099-01-01'}),pending);
      await f.assertNoJoin();assert.equal(await f.page.locator('.nf-call[open]').count(),0);
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.transportLog.filter(x=>x.method==='create').every(x=>window.__voiceRace.transportLog.some(y=>y.id===x.id&&y.method==='leave'))),true,'unmount leaves any acquired transport');
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.apiLog.some(x=>x.method==='end'&&x.owner==='owner-a')),true,'old owner call ends');
    });
    await run('recovery transient state and token failures preserve active call',async f=>{
      await f.incoming();await f.button('قبول المكالمة').click();await f.page.getByText('متصل الآن',{exact:true}).waitFor();
      await f.page.evaluate(()=>{const p=window.__voiceRace;p.server=p.call('incoming-fixture','active');});
      const pending=await f.hold('state');await f.page.evaluate(()=>window.__voiceRace.refresh());await f.requested(pending);await f.page.evaluate(id=>window.__voiceRace.reject(id),pending);
      await f.page.waitForFunction(()=>window.__voiceRace.apiLog.filter(x=>x.method==='state').length>=3);await f.page.getByText('متصل الآن',{exact:true}).waitFor();
      const token=await f.hold('credentials');await f.page.evaluate(()=>window.__voiceRace.events.renew());await f.requested(token);await f.page.evaluate(id=>window.__voiceRace.reject(id),token);
      await f.page.waitForFunction(()=>window.__voiceRace.transportLog.some(x=>x.method==='renew'));
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.apiLog.filter(x=>x.method==='end').length),0);
    });
    await run('recovery rejoins muted and preserves timer',async f=>{
      await f.incoming();await f.button('قبول المكالمة').click();await f.page.getByText('متصل الآن',{exact:true}).waitFor();await f.button('كتم الصوت').click();
      await f.page.evaluate(()=>window.__voiceRace.events.error(new TypeError('Failed to fetch')));
      await f.page.waitForFunction(()=>window.__voiceRace.transportLog.filter(x=>x.method==='join').length===2);await f.page.getByText('متصل الآن',{exact:true}).waitFor();
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.transportLog.filter(x=>x.method==='join').at(-1).initiallyMuted),true);await f.button('تشغيل الميكروفون').waitFor();
    });
    await run('recovery exhausted exposes redial and requires new answer',async f=>{
      await f.incoming();await f.page.evaluate(()=>{window.__voiceRace.joinFailures=3});await f.button('قبول المكالمة').click();await f.button('إعادة الاتصال').waitFor({timeout:10000});await f.button('إعادة الاتصال').click();
      await f.page.waitForFunction(()=>window.__voiceRace.apiLog.some(x=>x.method==='start'));await f.page.getByText('بانتظار الرد…',{exact:true}).waitFor();
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.transportLog.filter(x=>x.method==='join').length),3);
    });
    await run('hidden browser preserves accepted call and foreground resumes without redial',async f=>{
      await f.incoming();await f.button('قبول المكالمة').click();await f.page.getByText('متصل الآن',{exact:true}).waitFor();
      await f.button('كتم الصوت').click();
      await f.page.evaluate(()=>{const p=window.__voiceRace;p.server=p.call('incoming-fixture','active');p.background();});
      await f.flush();
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.apiLog.filter(x=>x.method==='end').length),0);
      await f.page.evaluate(()=>window.__voiceRace.foreground());
      await f.page.waitForFunction(()=>window.__voiceRace.transportLog.some(x=>x.method==='resume'));
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.transportLog.filter(x=>x.method==='join').length),1);
      await f.button('تشغيل الميكروفون').waitFor();
    });
    await run('hidden browser preserves a delayed accepted response',async f=>{
      await f.incoming();const pending=await f.hold('accept');await f.button('قبول المكالمة').click();await f.requested(pending);
      await f.page.evaluate(()=>window.__voiceRace.background());
      await f.page.evaluate(id=>{const p=window.__voiceRace;p.server=p.call('incoming-fixture','active');p.complete(id,p.server);},pending);
      await f.page.waitForFunction(()=>window.__voiceRace.transportLog.filter(x=>x.method==='join').length===1);
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.apiLog.filter(x=>x.method==='end').length),0);
    });
    await run('foreground confirms server expiry before restarting audio',async f=>{
      await f.incoming();await f.button('قبول المكالمة').click();await f.page.getByText('متصل الآن',{exact:true}).waitFor();
      await f.page.evaluate(()=>{const p=window.__voiceRace;p.background();p.server=p.call('incoming-fixture','ended');p.server.endReason='expired';p.foreground();});
      await f.button('العودة للمحادثة').waitFor();
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.transportLog.filter(x=>x.method==='resume').length),0);
    });
    await run('foreground repairs ended microphone and ignores stale transport callbacks',async f=>{
      await f.incoming();await f.button('قبول المكالمة').click();await f.page.getByText('متصل الآن',{exact:true}).waitFor();
      await f.page.evaluate(()=>{const p=window.__voiceRace;p.server=p.call('incoming-fixture','active');p.resumeNeedsRejoin=true;p.background();p.foreground();});
      await f.page.waitForFunction(()=>window.__voiceRace.transportLog.filter(x=>x.method==='join').length===2);
      await f.page.evaluate(()=>{const p=window.__voiceRace;p.allEvents[0].ended();p.allEvents[0].error(new Error('old transport'));});
      await f.flush();await f.page.getByText('متصل الآن',{exact:true}).waitFor();
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.apiLog.filter(x=>x.method==='end').length),0);
    });
    await run('exhausted transient state reads preserve audio until authoritative end',async f=>{
      await f.incoming();await f.button('قبول المكالمة').click();await f.page.getByText('متصل الآن',{exact:true}).waitFor();
      await f.page.evaluate(()=>{const p=window.__voiceRace;p.server=p.call('incoming-fixture','active');p.stateFailures=3;p.refresh();});
      await f.page.getByText('الاتصال ضعيف. نحاول استعادته تلقائيًا…',{exact:true}).waitFor();
      assert.equal(await f.page.evaluate(()=>window.__voiceRace.apiLog.filter(x=>x.method==='end').length),0);
      await f.page.evaluate(()=>window.__voiceRace.refresh());
      await f.page.getByText('الاتصال ضعيف. نحاول استعادته تلقائيًا…',{exact:true}).waitFor({state:'hidden'});
      await f.page.getByText('متصل الآن',{exact:true}).waitFor();
    });
  }finally{await browser.close();}
  console.log(JSON.stringify(cases,null,2));
  if(cases.some(c=>c.status==='failed'))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
