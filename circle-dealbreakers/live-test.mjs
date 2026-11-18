/**
 * Live acceptance test. Run only after the event function and schema are deployed.
 * Creates two temporary participants and one anonymous entry; never deletes real data.
 * Restores the initial event controls and records exact IDs for a separate DB cleanup.
 * Host code and all session/login credentials stay in memory and are never logged.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';

const EVENT_ID = 'the-circle-2026-10-07';
const ENDPOINT = 'https://xytwdgiihfmxiflwuxti.supabase.co/functions/v1/circle-event';
const ANONYMOUS_ENDPOINT = 'https://xytwdgiihfmxiflwuxti.supabase.co/functions/v1/circle-dealbreakers';
const CLEANUP_PATH = new URL('./cleanup-candidates.json', import.meta.url);
const runId = randomUUID();
const suffix = runId.slice(0, 8);
const testNames = new Set([`QA-${suffix}-A`, `QA-${suffix}-B`]);
const checks = [];
const cleanup = {
  eventId: EVENT_ID, runId, createdAt: new Date().toISOString(),
  participantIds: [], anonymousSubmissionIds: [], initialEvent: null,
  restoration: { attempted: false, restored: false, initialTimerExpiredDuringTest: false },
  completed: false, failedStage: null, checks
};
let apiKey = '';
let stage = 'read private test configuration';
let hostAuthenticated = false;
let eventChanged = false;
let failed = false;

class CookieJar {
  values = new Map();
  header() { return Array.from(this.values, ([name, value]) => `${name}=${value}`).join('; '); }
  absorb(headers) {
    const cookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
    for (const cookie of cookies) {
      const first = cookie.split(';', 1)[0];
      const separator = first.indexOf('=');
      if (separator < 1) continue;
      const name = first.slice(0, separator), value = first.slice(separator + 1);
      if (!value || /(?:^|;)\s*Max-Age=0(?:;|$)/i.test(cookie)) this.values.delete(name);
      else this.values.set(name, value);
    }
  }
}

const host = new CookieJar();
const guest = new CookieJar();
const guestReturn = new CookieJar();
const customGuest = new CookieJar();
const resetGuest = new CookieJar();
const guestJars = [guest, guestReturn, customGuest, resetGuest];

function ensure(condition, label) {
  if (!condition) throw new Error(label);
}
function pass(label) { checks.push(label); }
function expectedStatus(result, status, label) { ensure(result.status === status, label); }
function participantId(value) { return value?.participantId ?? value?.participant_id; }
function slideId(value) { return value?.slideId ?? value?.slide_id; }
function timestamp(value) { const time = Date.parse(value || ''); return Number.isFinite(time) ? time : 0; }
function codeFromEnv(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    values.set(match[1], value);
  }
  const code = values.get('CIRCLE_HOST_CODE') || values.get('HOST_CODE') || values.get('THE_CIRCLE_HOST_CODE');
  ensure(typeof code === 'string' && code.length >= 8, 'Private host code is missing');
  return code;
}
async function checkpoint() {
  await writeFile(CLEANUP_PATH, `${JSON.stringify(cleanup, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}
function recordParticipant(id) {
  ensure(typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id), 'Created participant ID is invalid');
  if (!cleanup.participantIds.includes(id)) cleanup.participantIds.push(id);
}

async function request(endpoint, body, jar = null) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', apikey: apiKey, Authorization: `Bearer ${apiKey}` };
  if (jar?.header()) headers.Cookie = jar.header();
  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'omit', signal: AbortSignal.timeout(20000) });
  jar?.absorb(response.headers);
  let data = null;
  try { data = await response.json(); } catch (_) { /* Assertions below report only safe labels. */ }
  return { status: response.status, data, headers: response.headers, sentCookie: Boolean(headers.Cookie) };
}
async function api(action, data = {}, jar = null) { return request(ENDPOINT, { action, ...data }, jar); }
async function successful(action, data, jar, status = 200) {
  const result = await api(action, data, jar);
  expectedStatus(result, status, `${action} returned an unexpected status`);
  ensure(result.data && typeof result.data === 'object', `${action} returned invalid JSON`);
  return result;
}
function securedCookie(result, name) {
  const cookies = typeof result.headers.getSetCookie === 'function' ? result.headers.getSetCookie() : [result.headers.get('set-cookie')].filter(Boolean);
  const cookie = cookies.find(value => value.startsWith(`${name}=`)) || '';
  ensure(/;\s*HttpOnly(?:;|$)/i.test(cookie) && /;\s*Secure(?:;|$)/i.test(cookie) && /;\s*SameSite=Lax(?:;|$)/i.test(cookie) && /;\s*Path=\/(?:;|$)/i.test(cookie), 'Session cookie security attributes are missing');
}

try {
  await checkpoint();
  const [env, frontend] = await Promise.all([
    readFile(new URL('./.env.host', import.meta.url), 'utf8'),
    readFile(new URL('./public/event-api.js', import.meta.url), 'utf8')
  ]);
  const hostCode = codeFromEnv(env);
  apiKey = frontend.match(/const\s+PUBLIC_API_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
  ensure(apiKey.length > 40, 'Public API key is missing');

  stage = 'unauthenticated report access';
  expectedStatus(await api('hostReport'), 401, 'Host report must require a host session');
  pass('unauthenticated host report denied');

  stage = 'host login and secure cookie';
  const hostLogin = await successful('hostLogin', { code: hostCode }, host);
  hostAuthenticated = true;
  securedCookie(hostLogin, 'circle_host');
  const initialState = (await successful('hostState', {}, host)).data;
  const initial = initialState.event;
  ensure(initial && typeof initial.currentSlide === 'string', 'Initial event snapshot missing');
  cleanup.initialEvent = { currentSlide: initial.currentSlide, votingOpen: initial.votingOpen, revealed: initial.revealed, endsAt: initial.endsAt ?? null };
  await checkpoint();
  pass('host login issues HttpOnly Secure SameSite cookie');

  stage = 'participant join and session recovery';
  const joined = await successful('join', { name: `QA-${suffix}-A` }, guest, 201);
  recordParticipant(joined.data.participant?.id); await checkpoint();
  const firstId = joined.data.participant.id;
  const firstCode = joined.data.loginCode;
  ensure(typeof firstCode === 'string' && firstCode.length >= 8, 'Join did not issue a personal code');
  securedCookie(joined, 'circle_participant');
  ensure((await successful('me', {}, guest)).data.participant?.id === firstId, 'Cookie did not restore participant');
  ensure((await successful('login', { code: firstCode }, guestReturn)).data.participant?.id === firstId, 'Personal code did not restore the same participant');
  pass('join, cookie restore, and personal-code login');

  stage = 'vote update and deduplication';
  ensure(initialState.slides.some(slide => slide.id === 'triage-1' && slide.kind === 'scenario' && slide.responseMode === 'vote'), 'Expected test slide unavailable');
  eventChanged = true;
  await successful('hostSlide', { slideId: 'triage-1' }, host);
  await successful('vote', { slideId: 'triage-1', choice: 1 }, guest);
  await successful('vote', { slideId: 'triage-1', choice: 4 }, guestReturn);
  const votedState = (await successful('hostState', {}, host)).data;
  const firstVotes = votedState.votes.filter(vote => participantId(vote) === firstId && slideId(vote) === 'triage-1');
  ensure(firstVotes.length === 1 && firstVotes[0].choice === 4, 'Changed vote must replace the earlier vote');
  pass('one current vote per participant and scenario');

  stage = 'hidden results still permit voting';
  await successful('hostControl', { revealed: false }, host);
  const hiddenState = (await successful('state', {}, guest)).data;
  ensure(hiddenState.event?.revealed === false && hiddenState.event?.votingOpen === true && hiddenState.slide?.id === 'triage-1', 'Hiding names must not hide the guest question or stop voting');
  await successful('vote', { slideId: 'triage-1', choice: 2 }, guest);
  await successful('vote', { slideId: 'triage-1', choice: 4 }, guest);
  pass('results visibility is independent of guest voting');

  stage = 'invalid, stale, and closed voting';
  expectedStatus(await api('vote', { slideId: 'triage-1', choice: 5 }, guest), 400, 'Invalid choice must be rejected');
  const stale = initialState.slides.find(slide => slide.id !== 'triage-1');
  ensure(stale?.id, 'A second slide is required for stale-vote test');
  expectedStatus(await api('vote', { slideId: stale.id, choice: 1 }, guest), 409, 'Stale slide must be rejected');
  await successful('hostControl', { votingOpen: false }, host);
  expectedStatus(await api('vote', { slideId: 'triage-1', choice: 1 }, guest), 409, 'Closed vote must be rejected');
  pass('invalid choice, stale slide, and closed window denied');

  stage = 'host-created participant and custom code';
  const customCode = `QA${randomBytes(9).toString('hex').toUpperCase()}`;
  const added = await successful('hostAdd', { name: `QA-${suffix}-B`, code: customCode }, host, 201);
  recordParticipant(added.data.participant?.id); await checkpoint();
  const secondId = added.data.participant.id;
  ensure(added.data.loginCode === customCode, 'Host-created custom code was not honored');
  ensure((await successful('login', { code: customCode }, customGuest)).data.participant?.id === secondId, 'Host-created participant could not log in');
  await successful('hostControl', { votingOpen: true, endsAt: new Date(Date.now() + 180000).toISOString() }, host);
  await successful('vote', { slideId: 'triage-1', choice: 3 }, customGuest);
  pass('host creates a participant with a working custom code');

  stage = 'reset code revokes prior code and sessions';
  const reset = await successful('hostResetCode', { participantId: secondId }, host);
  const replacementCode = reset.data.loginCode;
  ensure(typeof replacementCode === 'string' && replacementCode !== customCode, 'Reset did not replace the personal code');
  expectedStatus(await api('me', {}, customGuest), 401, 'Reset must invalidate the old cookie session');
  expectedStatus(await api('login', { code: customCode }), 401, 'Reset must invalidate the old login code');
  ensure((await successful('login', { code: replacementCode }, resetGuest)).data.participant?.id === secondId, 'Replacement code must preserve participant identity');
  pass('code reset revokes old sessions and code');

  stage = 'participant removal blocks access';
  await successful('hostRemove', { participantId: secondId }, host);
  expectedStatus(await api('login', { code: replacementCode }), 401, 'Removed participant must not log in');
  ensure([401, 403].includes((await api('vote', { slideId: 'triage-1', choice: 1 }, resetGuest)).status), 'Removed participant must not vote');
  pass('removed participant cannot log in or vote');

  stage = 'anonymous submission remains independent';
  const anonymousId = randomUUID();
  cleanup.anonymousSubmissionIds.push(anonymousId); await checkpoint();
  const anonymousText = `QA ${suffix}: مشاركة تجريبية لاختبار الإرسال.`;
  const anonymous = await request(ANONYMOUS_ENDPOINT, { submissionId: anonymousId, text: anonymousText, website: '' });
  expectedStatus(anonymous, 201, 'Anonymous submission must be accepted');
  ensure(!anonymous.sentCookie, 'Anonymous submission must not send a session cookie');
  expectedStatus(await request(ANONYMOUS_ENDPOINT, { submissionId: anonymousId, text: anonymousText, website: '' }), 200, 'Anonymous retry must be idempotent');
  pass('anonymous submission uses no participant cookie and is idempotent');

  stage = 'private report preserves all answers';
  const report = (await successful('hostReport', {}, host)).data;
  for (const [id, expectedChoice] of [[firstId, 4], [secondId, 3]]) {
    const rows = report.votes.filter(vote => participantId(vote) === id && slideId(vote) === 'triage-1');
    ensure(rows.length === 1 && rows[0].choice === expectedChoice, 'Report must preserve the final answer for each participant');
    ensure(report.participants.some(person => person.id === id), 'Report must retain participant identity');
  }
  ensure(report.participants.find(person => person.id === secondId)?.active === false, 'Removed participant must remain inactive in the report');
  ensure(report.participants.every(person => !Object.keys(person).some(key => /code|token|cookie|hash/i.test(key))), 'Participant report must not expose credentials');
  const anonymousRows = report.anonymous.filter(item => item.id === anonymousId);
  ensure(anonymousRows.length === 1 && anonymousRows[0].text === anonymousText, 'Anonymous report entry missing or duplicated');
  ensure(!Object.keys(anonymousRows[0]).some(key => /participant|name|email|cookie|token|code|(^|_)ip($|_)/i.test(key)), 'Anonymous report entry must not contain identity fields');
  pass('private report retains final votes and independent anonymous text');
  cleanup.completed = true;
} catch (_) {
  failed = true;
  cleanup.failedStage = stage;
} finally {
  // Recover IDs from an accepted creation whose response was lost, without logging names.
  if (hostAuthenticated) {
    try {
      const report = await api('hostReport', {}, host);
      if (report.status === 200 && Array.isArray(report.data?.participants)) {
        for (const person of report.data.participants) if (testNames.has(person.name)) recordParticipant(person.id);
      }
    } catch (_) { /* Known IDs are still written below. */ }
  }
  if (hostAuthenticated && eventChanged && cleanup.initialEvent) {
    cleanup.restoration.attempted = true;
    try {
      const initial = cleanup.initialEvent;
      await successful('hostSlide', { slideId: initial.currentSlide }, host);
      const expired = initial.votingOpen && (!initial.endsAt || Date.parse(initial.endsAt) <= Date.now());
      cleanup.restoration.initialTimerExpiredDuringTest = Boolean(expired);
      const controls = { votingOpen: Boolean(initial.votingOpen && !expired), revealed: Boolean(initial.revealed), endsAt: initial.endsAt };
      const restored = (await successful('hostControl', controls, host)).data.event;
      ensure(restored?.currentSlide === initial.currentSlide && restored?.votingOpen === controls.votingOpen && restored?.revealed === controls.revealed && timestamp(restored?.endsAt) === timestamp(controls.endsAt), 'Event restoration mismatch');
      cleanup.restoration.restored = true;
    } catch (_) { failed = true; cleanup.failedStage ||= 'restore initial event settings'; }
  } else if (!eventChanged) cleanup.restoration.restored = true;

  // Retire this script's sessions; exact participant/anonymous rows are left for root cleanup.
  if (apiKey) {
    for (const jar of guestJars) { if (jar.header()) { try { await api('logout', {}, jar); } catch (_) { /* DB cleanup follows. */ } } }
    if (hostAuthenticated) { try { await api('hostLogout', {}, host); } catch (_) { /* Credentials remain memory-only. */ } }
  }
  cleanup.finishedAt = new Date().toISOString();
  cleanup.completed = cleanup.completed && !failed;
  try { await checkpoint(); } catch (_) { failed = true; cleanup.failedStage ||= 'write cleanup candidates'; }
  console.log(JSON.stringify({ ok: !failed, checks, restored: cleanup.restoration.restored, temporaryParticipants: cleanup.participantIds.length, temporaryAnonymousEntries: cleanup.anonymousSubmissionIds.length, cleanupFile: 'circle-dealbreakers/cleanup-candidates.json', ...(failed ? { failedStage: cleanup.failedStage } : {}) }, null, 2));
  if (failed) process.exitCode = 1;
}
