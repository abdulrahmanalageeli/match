import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoReadiness, currentVerificationStatus, emptyReadinessPassport, normalizeReadinessDraft, preparationItems } from '../src/readiness/model.ts';

const draft = () => ({ consentVersion: 'readiness-v1', timeline: '6_to_12_months', family: 'ready_to_discuss', preparation: Object.fromEntries(preparationItems.map(item => [item.id, 'in_progress'])) });

test('passport requires explicit versioned consent and bounded self-reported answers', () => {
  for (const input of [{...draft(),consentVersion:null},{...draft(),timeline:'tomorrow'},{...draft(),family:null},{...draft(),preparation:{}},{...draft(),preparation:[]},{...draft(),preparation:{...draft().preparation,course:'verified'}}]) {
    assert.throws(() => normalizeReadinessDraft(input));
  }
  const saved = normalizeReadinessDraft({...draft(),claims:[{kind:'identity',status:'valid'}],nationalId:'DO NOT SEND',preparation:{...draft().preparation,salary:100000}});
  assert.deepEqual(saved, draft());
  assert.equal(JSON.stringify(saved).includes('DO NOT SEND'), false);
});

test('private by default, session isolated, unverified and separate from peer view', async () => {
  const readiness = createDemoReadiness(() => true, () => {});
  assert.deepEqual(await readiness('get'), emptyReadinessPassport());
  const saved = await readiness('save', draft());
  assert.equal(saved.verificationAvailable, false);
  assert.deepEqual(saved.claims, []);
  assert.deepEqual(saved.grants, []);
  saved.preparation.course = 'ready'; // A caller cannot mutate stored state.
  assert.equal((await readiness('get')).preparation.course, 'in_progress');
  assert.deepEqual(await readiness('view', {connectionId:'accepted'}), {available:false,sections:[]});
  assert.deepEqual(await createDemoReadiness(() => true, () => {})('get'), emptyReadinessPassport());
});

test('sharing needs saved consent, accepted match, valid duration and selected sections', async () => {
  const readiness = createDemoReadiness(id => id === 'accepted', () => {});
  const share = {connectionId:'accepted',sections:['timeline'],days:7};
  await assert.rejects(readiness('share', share));
  await readiness('save', draft());
  for (const invalid of [{...share,connectionId:'pending'},{...share,days:365},{...share,sections:[]},{...share,sections:['national_id']}]) await assert.rejects(readiness('share',invalid));
  const result = await readiness('share',share);
  assert.deepEqual(result.grants[0].sections,['timeline']);
  assert.equal(result.grants.length,1);
  assert.deepEqual((await readiness('revoke',{connectionId:'accepted'})).grants,[]);
});

test('expiry and ending a match invalidate sharing; withdrawal removes answers and grants', async () => {
  let now = Date.UTC(2026,10,7), active = true;
  const readiness = createDemoReadiness(() => active, () => {}, () => now);
  await readiness('save',draft());
  await readiness('share',{connectionId:'accepted',sections:['timeline','preparation'],days:7});
  now += 7*86400000;
  assert.deepEqual((await readiness('get')).grants,[]);
  await readiness('share',{connectionId:'accepted',sections:['timeline'],days:30});
  active = false;
  assert.deepEqual((await readiness('get')).grants,[]);
  active = true;
  assert.deepEqual((await readiness('get')).grants,[]);
  assert.deepEqual(await readiness('withdraw'),emptyReadinessPassport());
});

test('a verified claim becomes expired at expiry and revoked claims stay revoked', () => {
  const claim = {id:'test',kind:'identity',label:'test',issuer:'test issuer',method:'issuer_confirmation',verifiedAt:'2026-11-01T00:00:00Z',expiresAt:'2026-11-07T00:00:00Z',status:'valid'};
  assert.equal(currentVerificationStatus(claim, Date.UTC(2026,10,6)), 'valid');
  assert.equal(currentVerificationStatus(claim, Date.UTC(2026,10,7)), 'expired');
  assert.equal(currentVerificationStatus({...claim,status:'revoked'},Date.UTC(2026,10,6)), 'revoked');
  assert.equal(currentVerificationStatus({...claim,expiresAt:'invalid'},Date.UTC(2026,10,6)), 'expired');
});
