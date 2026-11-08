import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

// Run: node --experimental-vm-modules --test tests/voice-transport.test.mjs
// Execute the real transport, replacing only its platform and SDK dependencies.
const code = ts.transpileModule(await readFile(new URL("../src/voice/transport.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const credentials = { appId: "fixture-app", channel: "fixture-private-call", uid: 17, token: "fixture-token", expiresAt: "2099-01-01T00:00:00Z", callId: "fixture-call" };
const tick = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function emitter() {
  const listeners = new Map();
  return {
    on(name, listener) { listeners.set(name, [...(listeners.get(name) ?? []), listener]); },
    off(name, listener) { listeners.set(name, (listeners.get(name) ?? []).filter(item => item !== listener)); },
    removeAllListeners() { listeners.clear(); },
    emit(name, ...args) { for (const listener of [...(listeners.get(name) ?? [])]) listener(...args); },
    listenerCount() { return [...listeners.values()].reduce((total, items) => total + items.length, 0); },
  };
}
function audioTrack() {
  return {
    ...emitter(),
    active: true, closed: 0, stopped: 0, played: 0, muted: false,
    getMediaStreamTrack() { return { readyState: this.active ? "live" : "ended" }; },
    close() { this.active = false; this.closed++; },
    stop() { this.stopped++; },
    play() { this.played++; },
    async setMuted(value) { this.muted = value; },
  };
}
function eventCollector() {
  const calls = { peer: [], reconnecting: [], renew: [], ended: [], error: [], playbackBlocked: [] };
  return { calls, events: Object.fromEntries(Object.keys(calls).map(name => [name, (...args) => calls[name].push(args)])) };
}
async function fixture(options = {}) {
  const stats = { sdkImports: 0, microphoneRequests: 0, nativeCalls: 0 };
  let audioResumes = 0;
  const clients = [], microphones = [];
  const microphoneStarted = deferred(), joinStarted = deferred(), publishStarted = deferred(), subscribeStarted = deferred();
  const sdkEvents = emitter();
  const sdk = {
    ...sdkEvents,
    setLogLevel() {}, disableLogUpload() {},
    resumeAudioContext() { audioResumes++; },
    createClient() {
      const client = {
        ...emitter(), remoteUsers: [], joined: 0, left: 0, published: [], renewed: [], connectionState: "DISCONNECTED",
        async join(...args) {
          this.joined++; this.connectionState = "CONNECTING"; joinStarted.resolve();
          await options.join?.(...args); this.connectionState = "CONNECTED"; return credentials.uid;
        },
        async leave() { this.left++; this.connectionState = "DISCONNECTED"; await options.leave?.(); },
        async publish(track) { this.published.push(track); publishStarted.resolve(); await options.publish?.(track); },
        async subscribe(user) { subscribeStarted.resolve(); await options.subscribe?.(user); return user.audioTrack; },
        async renewToken(token) { this.renewed.push(token); },
      };
      clients.push(client); return client;
    },
    async createMicrophoneAudioTrack() {
      stats.microphoneRequests++; microphoneStarted.resolve();
      const track = options.microphone ? await options.microphone() : audioTrack();
      microphones.push(track); return track;
    },
  };
  const context = vm.createContext({ console, Promise, setTimeout, clearTimeout });
  const platform = new vm.SyntheticModule(["Capacitor", "registerPlugin"], function () {
    this.setExport("Capacitor", { getPlatform: () => "web", isNativePlatform: () => false });
    this.setExport("registerPlugin", () => new Proxy({}, { get: () => () => { stats.nativeCalls++; throw new Error("Native plugin must not run in browser tests"); } }));
  }, { context });
  const sdkModule = new vm.SyntheticModule(["default"], function () { this.setExport("default", sdk); }, { context });
  await sdkModule.link(() => { throw new Error("Unexpected SDK dependency"); });
  const module = new vm.SourceTextModule(code, {
    context,
    identifier: "voice-transport-under-test",
    async importModuleDynamically(specifier) {
      assert.equal(specifier, "agora-rtc-sdk-ng"); stats.sdkImports++;
      if (sdkModule.status !== "evaluated") await sdkModule.evaluate();
      return sdkModule;
    },
  });
  await module.link(specifier => { assert.equal(specifier, "@capacitor/core"); return platform; });
  await module.evaluate();
  return {
    stats, clients, microphones, microphoneStarted, joinStarted, publishStarted, subscribeStarted,
    create: events => module.namespace.createVoiceTransport(events),
    prepare: () => module.namespace.prepareVoiceTransport(),
    autoplay() { sdk.onAutoplayFailed?.(); sdkEvents.emit("autoplay-failed"); },
    interruptAudio() { sdkEvents.emit("audio-context-state-changed", "interrupted"); },
    audioResumes: () => audioResumes,
    autoplayListenerCount: () => Number(typeof sdk.onAutoplayFailed === "function") + sdkEvents.listenerCount(),
  };
}
function assertClean(f) {
  assert(f.microphones.every(track => !track.active), "all acquired microphones must release capture");
  assert(f.clients.every(client => client.listenerCount() === 0), "client listeners must be detached");
  assert.equal(f.autoplayListenerCount(), 0, "global autoplay listener must be detached");
}

test("ringing prewarm downloads once without opening a client or microphone; accepted join reuses it", async () => {
  const f = await fixture();
  await Promise.all([f.prepare(), f.prepare()]);
  assert.deepEqual(f.stats, { sdkImports: 1, microphoneRequests: 0, nativeCalls: 0 });
  assert.equal(f.clients.length, 0);
  const transport = f.create(eventCollector().events);
  await transport.join(credentials);
  assert.equal(f.stats.sdkImports, 1);
  assert.equal(f.stats.microphoneRequests, 1);
  await transport.leave();
  assertClean(f);
});

test("unused/demo transport boundary does not load SDK, request microphone, or call native plugin", async () => {
  const f = await fixture(), { events } = eventCollector(), transport = f.create(events);
  await transport.mute(true); await transport.renew("unused"); transport.play(); await transport.leave();
  assert.deepEqual(f.stats, { sdkImports: 0, microphoneRequests: 0, nativeCalls: 0 });
});

test("cancelling while microphone permission is pending closes its late track without joining", async t => {
  const microphone = deferred(), track = audioTrack();
  const f = await fixture({ microphone: () => microphone.promise }), transport = f.create(eventCollector().events);
  t.after(() => transport.leave());
  const joining = transport.join(credentials); await f.microphoneStarted.promise;
  await transport.leave(); microphone.resolve(track); await joining;
  assert.equal(f.clients[0].joined, 0); assert.equal(f.clients[0].published.length, 0);
  assert(track.closed > 0); assertClean(f);
});

test("cancelling during asynchronous channel join closes capture and never publishes", async t => {
  const joined = deferred();
  const f = await fixture({ join: () => joined.promise }), transport = f.create(eventCollector().events);
  t.after(() => transport.leave());
  const joining = transport.join(credentials); await f.joinStarted.promise;
  await transport.leave(); assertClean(f);
  joined.resolve(); await joining;
  assert.equal(f.clients[0].published.length, 0); assert(f.clients[0].left > 0); assertClean(f);
});

test("cancelling during publish releases capture even before publish settles", async t => {
  const published = deferred();
  const f = await fixture({ publish: () => published.promise }), transport = f.create(eventCollector().events);
  t.after(() => transport.leave());
  const joining = transport.join(credentials); await f.publishStarted.promise;
  await transport.leave(); assertClean(f); published.resolve(); await joining; assertClean(f);
});

test("microphone permission rejection cleans listeners without caller-side cleanup", async t => {
  const denied = new Error("PERMISSION_DENIED");
  const f = await fixture({ microphone: async () => { throw denied; } }), transport = f.create(eventCollector().events);
  t.after(() => transport.leave());
  await assert.rejects(transport.join(credentials), error => error === denied);
  assert.equal(f.clients[0].joined, 0); assertClean(f);
});

test("channel join failure closes the already acquired microphone and listeners", async t => {
  const failure = new Error("fixture join failure");
  const f = await fixture({ join: async () => { throw failure; } }), transport = f.create(eventCollector().events);
  t.after(() => transport.leave());
  await assert.rejects(transport.join(credentials), error => error === failure);
  assert.equal(f.clients[0].published.length, 0); assertClean(f);
});

test("publish failure releases capture and leaves the joined channel", async t => {
  const failure = new Error("fixture publish failure");
  const f = await fixture({ publish: async () => { throw failure; } }), transport = f.create(eventCollector().events);
  t.after(() => transport.leave());
  await assert.rejects(transport.join(credentials), error => error === failure);
  assertClean(f); assert(f.clients[0].left > 0);
});

test("normal leave stops remote playback and detaches every client and autoplay listener", async () => {
  const f = await fixture(), collected = eventCollector(), transport = f.create(collected.events);
  await transport.join(credentials);
  const remote = audioTrack(); f.clients[0].remoteUsers.push({ audioTrack: remote });
  f.autoplay(); assert.equal(collected.calls.playbackBlocked.length, 1);
  await transport.mute(true); assert.equal(f.microphones[0].muted, true);
  await transport.leave();
  assert.equal(remote.stopped, 1); assertClean(f);
  f.clients[0].emit("token-privilege-will-expire"); f.autoplay();
  assert.equal(collected.calls.renew.length, 0); assert.equal(collected.calls.playbackBlocked.length, 1);
});

test("a late subscription completion after cancellation cannot start remote audio", async () => {
  const subscribed = deferred();
  const f = await fixture({ subscribe: () => subscribed.promise }), collected = eventCollector(), transport = f.create(collected.events);
  await transport.join(credentials);
  const remote = audioTrack(), user = { audioTrack: remote }; f.clients[0].remoteUsers.push(user);
  f.clients[0].emit("user-published", user, "audio"); await f.subscribeStarted.promise;
  await transport.leave(); subscribed.resolve(); await tick();
  assert.equal(remote.played, 0); assert.equal(collected.calls.peer.length, 0); assertClean(f);
});

test("teardown of an older transport cannot remove a newer call's autoplay recovery", async t => {
  const f = await fixture(), oldEvents = eventCollector(), newEvents = eventCollector();
  const oldCall = f.create(oldEvents.events), newCall = f.create(newEvents.events);
  t.after(async () => { await oldCall.leave(); await newCall.leave(); });
  await oldCall.join(credentials); await newCall.join({ ...credentials, callId: "new-call", channel: "new-channel" });
  await oldCall.leave(); f.autoplay();
  assert.equal(oldEvents.calls.playbackBlocked.length, 0);
  assert.equal(newEvents.calls.playbackBlocked.length, 1);
  await newCall.leave(); assertClean(f);
});

test("terminal SDK disconnection reaches the call error or ended callback", async t => {
  const f = await fixture(), collected = eventCollector(), transport = f.create(collected.events);
  t.after(() => transport.leave());
  await transport.join(credentials);
  f.clients[0].emit("connection-state-change", "RECONNECTING", "CONNECTED");
  assert.equal(collected.calls.reconnecting.at(-1)[0], true);
  f.clients[0].emit("connection-state-change", "DISCONNECTED", "RECONNECTING", "SERVER_ERROR");
  assert(collected.calls.error.length + collected.calls.ended.length > 0, "terminal disconnect must not leave the call looking active");
});


test('recovery applies mute before any audio publication',async()=>{
 const f=await fixture({publish:track=>assert.equal(track.muted,true)});
 const t=f.create(eventCollector().events);await t.join(credentials,true);
 assert.equal(f.clients[0].published.length,1);await t.leave();assertClean(f);
});

test('foreground resume restores audio playback without joining or unmuting again', async () => {
  const f = await fixture(), collected = eventCollector(), transport = f.create(collected.events);
  await transport.join(credentials, true);
  const remote = audioTrack(); f.clients[0].remoteUsers.push({ audioTrack: remote });
  f.interruptAudio(); assert.equal(collected.calls.playbackBlocked.length, 1);
  assert.equal(await transport.resume(), true);
  assert.equal(f.audioResumes(), 1); assert.equal(remote.played, 1);
  assert.equal(f.clients[0].joined, 1); assert.equal(f.microphones[0].muted, true);
  await transport.leave(); f.interruptAudio(); transport.play();
  assert.equal(remote.played, 1); assert.equal(collected.calls.playbackBlocked.length, 1); assertClean(f);
});

test('ended microphone or disconnected channel requires a new transport on resume', async () => {
  for (const problem of ['microphone', 'channel']) {
    const f = await fixture(), collected = eventCollector(), transport = f.create(collected.events);
    await transport.join(credentials);
    if (problem === 'microphone') {
      f.microphones[0].active = false; f.microphones[0].emit('track-ended');
      assert.equal(collected.calls.error.length, 1);
    } else f.clients[0].connectionState = 'DISCONNECTED';
    assert.equal(await transport.resume(), false);
    await transport.leave(); f.microphones[0].emit('track-ended');
    assert.equal(collected.calls.error.length, problem === 'microphone' ? 1 : 0); assertClean(f);
  }
});

test('repeated leave is idempotent and a closed transport cannot resume playback', async () => {
  const f = await fixture(), transport = f.create(eventCollector().events);
  await transport.join(credentials);
  await Promise.all([transport.leave(), transport.leave()]);
  assert.equal(f.clients[0].left, 1);
  assert.equal(await transport.resume(), false); assertClean(f);
});
