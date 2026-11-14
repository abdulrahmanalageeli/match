import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

let loader, initialDraft, validateStep, toProfile, profileBaseline, personalityQuestions, personalityVersion, dimensions, unresolvedDetailSlides, withFamilyDefaults;
before(async () => {
  loader = await createServer({ configFile: false, appType: "custom", logLevel: "error",
    optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false } });
  ({ initialDraft, validateStep, toProfile, profileBaseline, unresolvedDetailSlides, withFamilyDefaults } = await loader.ssrLoadModule("/src/onboarding/draft.ts"));
  ({ dimensions } = await loader.ssrLoadModule("/src/compatibility/model.ts"));
  ({ personalityQuestions, personalityVersion } = await loader.ssrLoadModule("/src/compatibility/personality.ts"));
});
after(() => loader?.close());

function answers() {
  return { ...initialDraft("11111111-1111-4111-8111-111111111111", null).answers,
    displayName: "نور", gender: "woman", age: "28", city: "الرياض", profession: "مهندسة",
    bio: "نبذة تجريبية", contact: "sample@example.invalid" };
}

test('saving uses canonical matching labels and keeps legacy free-text descriptions', () => {
  const profile = toProfile({ ...answers(), city: 'Riyadh', education: 'بكالوريوس هندسة',
    marriageBasics: { nationality: 'سعودية', childrenCount: 0 },
    partnerCriteria: { nationality: { mode: 'prefer', values: ['سعودي', 'سعودية', 'عمانية'] } } });
  assert.equal(profile.city, 'الرياض');
  assert.equal(profile.education, 'بكالوريوس هندسة');
  assert.equal(profile.profession, 'مهندسة');
  assert.equal(profile.marriageBasics.nationality, 'سعودي');
  assert.equal(profile.marriageBasics.childrenCount, 0);
  assert.deepEqual(profile.partnerCriteria.nationality.values, ['سعودي', 'عُماني']);
});

test('Beena permits skipping and partial answers, validates submitted data, and invalidates stale baselines', () => {
  const p=answers();
  assert.equal(validateStep('beena',p,true),null);
  p.beena={version:'beena-v1',answers:{finances:{self:'A',partner:[],importance:2}}};
  assert.equal(validateStep('beena',p,true),null);
  const profile=toProfile(p);
  assert.deepEqual(initialDraft('owner',profile).answers.beena,p.beena);
  assert.notEqual(profileBaseline(profile),profileBaseline({...profile,beena:null}));
  assert.equal(validateStep('beena',{...p,beena:{...p.beena,answers:{unknown:{self:'A'}}}},true)?.field,'beena');
});

test("optional public details and unfinished personality assessment do not block submission", () => {
  const p = answers();
  p.personalityAnswers = { [personalityQuestions[0].id]: "C" };
  for (const chapter of ["details", "avatar", "criteria", "personality"]) assert.equal(validateStep(chapter, p, true), null);
  const submitted = toProfile(p);
  assert.equal(submitted.personalityVersion, personalityVersion);
  assert.deepEqual(submitted.personalityAnswers, p.personalityAnswers);
  assert.equal(submitted.marriageBasics, undefined);
  assert.equal(submitted.partnerCriteria, undefined);
  assert.equal(submitted.appearanceVersion, "appearance-v1");
  assert.equal(Object.hasOwn(submitted, "publicAvatar"), false);
});

test('marriage timing and meeting choices stay optional, survive editing, and reject unknown values', () => {
  const p = answers();
  for (const marriageTimeline of ['within_3_months', 'three_to_six_months', 'six_to_twelve_months', 'over_a_year', 'when_ready']) {
    for (const meetingPreference of ['public_before_formal', 'family_before_formal', 'after_formal', 'discuss_together']) {
      p.marriageBasics = { marriageTimeline, meetingPreference };
      assert.equal(validateStep('details', p, true), null);
      const submitted = toProfile(p);
      assert.deepEqual(submitted.marriageBasics, p.marriageBasics);
      assert.deepEqual(initialDraft('owner', submitted).answers.marriageBasics, p.marriageBasics);
    }
  }
  for (const marriageBasics of [{ marriageTimeline: 'soon' }, { meetingPreference: 'anywhere' }, { marriageTimeline: null }, { meetingPreference: 1 }]) {
    assert.equal(validateStep('details', { ...p, marriageBasics }, true)?.field, 'marriageBasics');
  }
  p.marriageBasics = { marriageTimeline: undefined, meetingPreference: undefined };
  assert.equal(validateStep('details', p, true), null);
  assert.deepEqual(JSON.parse(JSON.stringify(toProfile(p).marriageBasics)), {});
});

test("avatar omission, explicit selection and removal preserve their separate meanings", () => {
  const p = answers();
  p.marriageBasics = { skinTone: "tone_4", dressStyle: "niqab", dressFlexibility: "keep" };
  assert.equal(Object.hasOwn(toProfile(p), "publicAvatar"), false);
  p.publicAvatar = { style: "uncovered", skinTone: "tone_8" };
  assert.equal(validateStep("avatar", p, true), null);
  const submitted = toProfile(p);
  assert.deepEqual(submitted.publicAvatar, { style: "uncovered", skinTone: "tone_8" });
  assert.deepEqual(submitted.marriageBasics, { skinTone: "tone_4", dressStyle: "niqab", dressFlexibility: "keep" });
  const resumed = initialDraft("11111111-1111-4111-8111-111111111111", submitted);
  assert.deepEqual(resumed.answers.publicAvatar, submitted.publicAvatar);
  resumed.answers.publicAvatar = null;
  assert.equal(validateStep("avatar", resumed.answers, true), null);
  assert.equal(toProfile(resumed.answers).publicAvatar, null);
});

test("avatar submission rejects unknown options, incomplete selections and image URLs", () => {
  for (const publicAvatar of [{}, { style: "hijab" }, { style: "other", skinTone: "tone_1" }, { style: "hijab", skinTone: "tone_9" }, "https://example.invalid/portrait.png", { style: "hijab", skinTone: "tone_1", url: "https://example.invalid/portrait.png" }]) {
    assert.equal(validateStep("avatar", { ...answers(), publicAvatar }, true)?.field, "publicAvatar");
  }
});

test("submission requires active criteria targets and ordered ranges", () => {
  const cases = [
    { height: { mode: "prefer", min: 190, max: 160 } },
    { weight: { mode: "require", min: 90, max: 60 } },
    { height: { mode: "prefer", min: 19 } },
    { height: { mode: "prefer" } },
    { tribalBackground: { mode: "require" } },
    { maritalStatus: { mode: "prefer", values: [] } },
    { children: { mode: "require" } },
    { smoking: { mode: "prefer" } },
    { skinTone: { mode: "prefer", values: [] } },
    { dressStyle: { mode: "require", values: [] } },
    { dressFlexibility: { mode: "require" } },
  ];
  for (const partnerCriteria of cases) {
    const issue = validateStep("criteria", { ...answers(), partnerCriteria }, true);
    assert.equal(issue?.field, "partnerCriteria", JSON.stringify(partnerCriteria));
  }
});

test("same-tribe requirement needs the member's own self-declared tribe", () => {
  const p = { ...answers(), partnerCriteria: { tribalBackground: { mode: "require", target: "same_tribe" } } };
  for (const marriageBasics of [undefined, {}, { tribalBackground: "non_tribal" }, { tribalBackground: "tribal" }, { tribalBackground: "tribal", tribeName: "   " }]) {
    assert.equal(validateStep("criteria", { ...p, marriageBasics }, true)?.field, "partnerCriteria");
  }
  assert.equal(validateStep("criteria", { ...p, marriageBasics: { tribalBackground: "tribal", tribeName: "قبيلة تجريبية" } }, true), null);
});

test("no-preference rules and one-sided ranges can submit without invented defaults", () => {
  const p = answers();
  p.partnerCriteria = { height: { mode: "prefer", min: 160 }, weight: { mode: "require", max: 90 }, tribalBackground: { mode: "any" }, maritalStatus: { mode: "any" }, children: { mode: "any" }, smoking: { mode: "any" } };
  assert.equal(validateStep("criteria", p, true), null);
  assert.deepEqual(toProfile(p).partnerCriteria, p.partnerCriteria);
});

test("invalid public basics are rejected while zero children remains valid", () => {
  const p = answers();
  for (const marriageBasics of [{ heightCm: 1 }, { weightKg: 6 }, { weightKg: 65.5 }, { childrenCount: -1 }, { tribeName: "قبيلة تجريبية" }, { tribalBackground: "non_tribal", tribeName: "قبيلة تجريبية" }]) {
    assert.equal(validateStep("details", { ...p, marriageBasics }, true)?.field, "marriageBasics");
  }
  p.marriageBasics = { childrenCount: 0, tribalBackground: "prefer_not_to_say" };
  assert.equal(validateStep("details", p, true), null);
  assert.deepEqual(toProfile(p).marriageBasics, p.marriageBasics);
});

test("server changes to any new assessment group invalidate an older draft baseline", () => {
  const p = toProfile(answers());
  p.marriageBasics = { heightCm: 170 };
  p.partnerCriteria = { smoking: { mode: "prefer", target: "never" } };
  p.personalityAnswers = { [personalityQuestions[0].id]: "A" };
  const original = profileBaseline(p);
  assert.notEqual(profileBaseline({ ...p, marriageBasics: { heightCm: 175 } }), original);
  assert.notEqual(profileBaseline({ ...p, partnerCriteria: { smoking: { mode: "require", target: "never" } } }), original);
  assert.notEqual(profileBaseline({ ...p, personalityAnswers: { [personalityQuestions[0].id]: "B" } }), original);
  const illustrated = { ...p, publicAvatar: { style: "hijab", skinTone: "tone_1" } };
  assert.notEqual(profileBaseline(illustrated), original);
  assert.notEqual(profileBaseline({ ...illustrated, publicAvatar: null }), profileBaseline(illustrated));
  assert.notEqual(profileBaseline({ ...illustrated, publicAvatar: { style: "niqab", skinTone: "tone_1" } }), profileBaseline(illustrated));
  assert.notEqual(profileBaseline({ ...illustrated, appearanceVersion: undefined }), profileBaseline(illustrated));
});


test('signup requires a birthday, derives age, and preserves existing age-only profiles', () => {
 const p={...answers(),birthDate:'1998-01-01',age:'99'};
 assert.equal(validateStep('identity',p,true,true),null);
 const result=toProfile(p);
 assert.equal(result.age,new Date().getFullYear()-1998);
 assert.equal(result.birthDate,'1998-01-01');
 assert.equal(initialDraft('owner',result).answers.birthDate,'1998-01-01');
 assert.equal(validateStep('identity',{...p,birthDate:undefined},true,true)?.field,'birthDate');
 assert.equal(validateStep('identity',{...p,birthDate:undefined,age:'28'},true),null);
 assert.equal(validateStep('identity',{...p,birthDate:'2020-01-01'},true,true)?.field,'birthDate');
});
test('new applicants clear marriage eligibility before the Luna step', () => {
 const base={...answers(),birthDate:'1998-01-01',marriageBasics:{maritalStatus:'never_married',polygynyPreference:'not_open'}};
 assert.equal(validateStep('identity',base,true,true,true),null);
 assert.equal(validateStep('identity',{...base,marriageBasics:{}},true,true,true)?.field,'marriageBasics');
 assert.equal(validateStep('identity',{...base,marriageBasics:{maritalStatus:'married',polygynyPreference:'not_open',currentWives:1}},true,true,true)?.field,'marriageBasics');
 assert.match(validateStep('identity',{...base,gender:'man',marriageBasics:{maritalStatus:'married',polygynyPreference:'open',currentWives:4}},true,true,true)?.text??'',/أربع/);
 // Existing profile editing remains compatible with its historical flow.
 assert.equal(validateStep('identity',{...base,marriageBasics:{}},true,true,false),null);
});

test('details slideshow contains only unresolved applicable groups', () => {
 const p={...answers(),marriageBasics:{maritalStatus:'never_married',polygynyPreference:'not_open'}};
 assert.deepEqual(unresolvedDetailSlides(p,false),[1,2,3,4,6]);
 p.marriageBasics={...p.marriageBasics,heightCm:165,weightKg:60,dressStyle:'hijab',dressFlexibility:'keep',spokenLanguages:['العربية'],preferredLanguage:'العربية',languageOpenness:'flexible',nationality:'سعودي',marriageTimeline:'when_ready',meetingPreference:'discuss_together',childrenCount:0,smoking:'never'};
 assert.deepEqual(unresolvedDetailSlides(p,false),[]);
 assert.deepEqual(unresolvedDetailSlides(p,true),[1,3,7]);
 p.marriageBasics={...p.marriageBasics,skinTone:'tone_4',tribalBackground:'prefer_not_to_say',religiousAffiliation:'prefer_not_to_say',prayerPractice:'prefer_not_to_say'};
 assert.deepEqual(unresolvedDetailSlides(p,true),[]);
});
test('contact accepts email and formatted phone numbers but rejects arbitrary text', () => {
 for(const contact of ['name@example.com','+966 50 123 4567','٠٥٠١٢٣٤٥٦٧']) assert.equal(validateStep('preferences',{...answers(),contact},true),null);
 for(const contact of ['hello','name@','123']) assert.equal(validateStep('preferences',{...answers(),contact},true)?.field,'contact');
});


test('new onboarding requires all 44 answers while legacy edits stay compatible', () => {
  const p = answers();
  assert.equal(validateStep('compatibility',p,true,false,true)?.field,'surveyAnswers');
  p.surveyAnswers = Object.fromEntries(dimensions.flatMap(d => [[d.id,d.options[0].code],[d.partnerId,d.options[0].code]]));
  assert.equal(validateStep('compatibility',p,true,false,true)?.field,'personalityAnswers');
  p.personalityAnswers = Object.fromEntries(personalityQuestions.map(q => [q.id,q.options[0].code]));
  assert.equal(validateStep('compatibility',p,true,false,true),null);
  for (const d of dimensions) for (const key of [d.id,d.partnerId]) assert.equal(validateStep('compatibility',{...p,surveyAnswers:{...p.surveyAnswers,[key]:'invalid'}},true,false,true)?.field,'surveyAnswers');
  for (const q of personalityQuestions) assert.equal(validateStep('compatibility',{...p,personalityAnswers:{...p.personalityAnswers,[q.id]:''}},true,false,true)?.field,'personalityAnswers');
  assert.equal(validateStep('compatibility',answers(),true),null);
});

test('new onboarding requires public details and explicit preference modes without forcing sensitive disclosures', () => {
  const p = answers();
  assert.ok(validateStep('story',p,true,false,true));
  Object.assign(p,{lookingFor:'شريك متفهم',lifeTogether:'حياة هادئة',education:'بكالوريوس',marriageIntent:'الزواج',valuesStatement:'الاحترام'});
  assert.equal(validateStep('story',p,true,false,true),null);
  assert.ok(validateStep('details',p,true,false,true));
  p.marriageBasics={heightCm:165,weightKg:65,spokenLanguages:['العربية'],preferredLanguage:'العربية',languageOpenness:'flexible',nationality:'سعودي',maritalStatus:'never_married',polygynyPreference:'not_open',childrenCount:0,smoking:'never',marriageTimeline:'when_ready',meetingPreference:'discuss_together'};
  assert.equal(validateStep('details',p,true,false,true),null);
  for(const key of Object.keys(p.marriageBasics)){const marriageBasics={...p.marriageBasics};delete marriageBasics[key];assert.ok(validateStep('details',{...p,marriageBasics},true,false,true),key);}
  assert.ok(validateStep('criteria',p,true,false,true));
  p.partnerCriteria=Object.fromEntries(['sharedLanguage','height','weight','nationality','education','profession','maritalStatus','children','smoking'].map(key=>[key,{mode:'any'}]));
  assert.equal(validateStep('criteria',p,true,false,true),null);
  for(const key of Object.keys(p.partnerCriteria)){const partnerCriteria={...p.partnerCriteria};delete partnerCriteria[key];assert.ok(validateStep('criteria',{...p,partnerCriteria},true,false,true),key);}
});


test('never-married default is editable and does not overwrite a declared children count', () => {
  const p=answers();
  assert.equal(withFamilyDefaults({...p,marriageBasics:{maritalStatus:'never_married'}}).marriageBasics.childrenCount,0);
  assert.equal(withFamilyDefaults({...p,marriageBasics:{maritalStatus:'never_married',childrenCount:2}}).marriageBasics.childrenCount,2);
  assert.equal(withFamilyDefaults({...p,marriageBasics:{maritalStatus:'divorced'}}).marriageBasics.childrenCount,undefined);
});

test('new smoking types survive profile validation and out-of-range measurements stay unresolved', () => {
  for(const smoking of ['never','cigarettes','vape','shisha','sometimes','yes']) {
    const p={...answers(),marriageBasics:{smoking,heightCm:165,weightKg:60}};
    assert.equal(validateStep('details',p,true),null,smoking);
    assert.equal(toProfile(p).marriageBasics.smoking,smoking);
  }
  assert.ok(unresolvedDetailSlides({...answers(),marriageBasics:{heightCm:0,weightKg:500}},false).includes(1));
});
