import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let loader, generatedBio;
test.before(async () => {
  loader = await createServer({ configFile:false, appType:'custom', logLevel:'error', optimizeDeps:{noDiscovery:true}, server:{middlewareMode:true,hmr:false, ws: false} });
  ({ generatedBio } = await loader.ssrLoadModule('/src/onboarding/profileDraftFallback.ts'));
});
test.after(() => loader?.close());

const answers = { city:'الرياض', profession:'التقنية والبرمجة', familyPreference:'من البداية', interestIds:['reading'], priorityCategories:[], bio:'', lookingFor:'', lifeTogether:'', valuesStatement:'', marriageIntent:'' };

test('public bio uses only public facts and invents no values or relationship plans', () => {
  assert.equal(generatedBio({ ...answers, city:'', profession:'' }), '');
  assert.equal(generatedBio({ ...answers, city:'', profession:'طالب / طالبة' }), 'أدرس حاليًا.');
  const first = generatedBio(answers), second = generatedBio(answers, 1);
  assert.notEqual(first, second);
  for (const text of [first, second]) {
    assert.match(text, /الرياض/);
    assert.match(text, /التقنية والبرمجة/);
    assert.doesNotMatch(text, /زوج|أفضّل|الاحترام|الصراحة/);
  }
});

test('the writing editor offers only grounded phrases from the confirmed interview, without changing the bio', async () => {
  const { writingNotes } = await loader.ssrLoadModule('/src/onboarding/PrivateWritingNotes.tsx');
  const doc = {status:'confirmed', turns:[{id:'1',answer:'أهوى الرسم. أفضّل شخصًا صبورًا.'}],
    statements:[{topic:'interest',subject:'self',turnId:'1',quote:'أهوى الرسم'},
      {topic:'description',subject:'partner',turnId:'1',quote:'صبورًا'},
      {topic:'description',subject:'self',turnId:'missing',quote:'كريم'}]};
  assert.deepEqual(writingNotes(doc),{bio:['أهوى الرسم'],lookingFor:['صبورًا']});
  assert.deepEqual(writingNotes({...doc,status:'review'}),{bio:[],lookingFor:[]});
  assert.doesNotMatch(generatedBio(answers),/الرسم/);
});

test('resuming confirmed age bounds respects member edits, both default endpoints, and withdrawals across devices', async () => {
  const {restoreLunaFields,markLunaFields,manualLunaFields,retractLunaFields} = await loader.ssrLoadModule('/src/onboarding/lunaDraftFields.ts');
  const original = {preferredMinAge:'18',preferredMaxAge:'110',partnerCriteria:{}};
  const turn = {id:'a'.repeat(36),question:'',answer:'',skipped:false};
  const limit = {id:'profile:preferredMaxAge',fieldId:'preferredMaxAge',values:['30'],mode:null,exclude:false,
    summary:'الحد الأعلى ٣٠',evidence:[{turnId:turn.id,quote:'٣٠'}],needsClarification:false};
  const doc = {turns:[turn],profileConfirmed:[limit]};
  const saved = restoreLunaFields(original,doc,true);
  assert.equal(saved.answers.preferredMaxAge,'30');
  assert.equal(restoreLunaFields(original,doc,true,undefined,true).answers.preferredMaxAge,'110');
  const overridden = {...saved.answers,preferredMaxAge:'110'};
  const marks = manualLunaFields(saved.answers,overridden,saved.fields);
  assert.equal(restoreLunaFields(overridden,doc,true,marks).answers.preferredMaxAge,'110');
  assert.equal(restoreLunaFields(saved.answers,{...doc,profileConfirmed:[]},true,saved.fields).answers.preferredMaxAge,'110');
  assert.equal(restoreLunaFields({...saved.answers,preferredMaxAge:'32'},{...doc,profileConfirmed:[]},true,saved.fields).answers.preferredMaxAge,'32');
  const height = {...limit,id:'profile:partnerCriteria.height',fieldId:'partnerCriteria.height',values:['','160'],mode:'prefer'};
  const range = {...original,partnerCriteria:{height:{mode:'prefer',max:160}}};
  const rangeMarks = markLunaFields(range,[height]);
  assert.equal(retractLunaFields(range,[height],rangeMarks).answers.partnerCriteria.height,undefined);
  assert.equal(retractLunaFields({...range,partnerCriteria:{height:{mode:'require',min:155}}},[height],rangeMarks).answers.partnerCriteria.height.min,155);
});
