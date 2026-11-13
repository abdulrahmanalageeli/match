import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let loader, buildProfileAnswerProvenance;
test.before(async () => {
  loader = await createServer({ configFile:false, appType:'custom', logLevel:'error', optimizeDeps:{noDiscovery:true}, server:{middlewareMode:true,hmr:false} });
  ({ buildProfileAnswerProvenance } = await loader.ssrLoadModule('/src/interview/profileProvenance.ts'));
});
test.after(() => loader?.close());

const profile = { displayName:'نورة', age:30, gender:'woman', city:'الرياض', profession:'التقنية والبرمجة', bio:'نبذة', contact:'x@example.com', preferredMinAge:30, preferredMaxAge:38, familyPreference:'من البداية', signupConsents:{sensitiveProfile:false} };
const proposal = { id:'profile:city', fieldId:'city', values:['الرياض'], mode:null, exclude:false, summary:'تسكن الرياض', evidence:[{turnId:'t1',quote:'أنا بالرياض'}], needsClarification:false };

test('keeps confirmed Luna evidence and marks other captured facts manual', () => {
  const rows = buildProfileAnswerProvenance(profile, [proposal], {model:'gpt-6-luna',promptVersion:'wudayn-interview-3',confirmedAt:'2026-11-13T10:00:00.000Z'});
  const city = rows.find(row => row.fieldId === 'city');
  assert.equal(city.source, 'luna_confirmed');
  assert.deepEqual(city.evidence, proposal.evidence);
  assert.equal(city.confidenceBasis, 'member_confirmed');
  assert.equal(rows.find(row => row.fieldId === 'displayName').source, 'manual');
});

test('a later manual edit invalidates the old AI source without deleting audit shape', () => {
  const rows = buildProfileAnswerProvenance({ ...profile, city:'جدة' }, [proposal]);
  const city = rows.find(row => row.fieldId === 'city');
  assert.equal(city.source, 'manual');
  assert.deepEqual(city.evidence, []);
});

test('sensitive fields are absent without the separate sensitive-processing choice', () => {
  const rows = buildProfileAnswerProvenance({ ...profile, marriageBasics:{skinTone:'medium'} }, []);
  assert.equal(rows.some(row => row.fieldId === 'marriageBasics.skinTone'), false);
});
