import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createInterviewService, CONSENT_VERSION } from '../../api/_lib/interview.mjs';
import { currentAssessment } from '../../api/_lib/interview-assessment.mjs';
import { parentingApplicable } from '../../src/compatibility/parenting.mjs';
import { addUser, asMember, asService, createDatabase } from './harness.mjs';
import { signCommunicationAgreement } from './communication-fixture.mjs';

async function confirmAnswers(user, profile, member, service) {
  const children = profile.partnerCriteria?.children;
  const includeParenting = parentingApplicable(profile.surveyAnswers, profile.marriageBasics?.childrenCount, children);
  const fields = currentAssessment.requiredFields.filter(field => includeParenting || field.fieldId !== 'parenting_approach');
  const choices = fields.map(field => {
    const key = field.side === 'partner' ? currentAssessment.preferenceById.get(field.fieldId).partnerId : field.fieldId;
    const code = (field.kind === 'personality' ? profile.personalityAnswers : profile.surveyAnswers)?.[key];
    assert.ok(code, 'Submitted profile is missing ' + key);
    return { id:field.id, values:[code] };
  });
  const profileContext = includeParenting ? [] : [
    {fieldId:'marriageBasics.childrenCount', values:[String(profile.marriageBasics.childrenCount)], mode:null, exclude:false},
    {fieldId:'partnerCriteria.children', values:[children.target], mode:children.mode, exclude:false},
  ];
  const interview = createInterviewService({
    env:{SUPABASE_SERVICE_ROLE_KEY:'disposable-database-fixture'},
    clientFactory:() => assert.fail('Direct confirmation must not invoke a model'),
    fetcher:async (url, options) => {
      const body = JSON.parse(options.body);
      if (url.endsWith('/marriage_interview_attest')) {
        assert.equal(body.member_id, user.id);
        return Response.json(await service('public.marriage_interview_attest($1,null,$2,$3,$4)', [user.id,body.expected_revision,body.event,body.reason]));
      }
      assert.ok(url.endsWith('/marriage_interview'));
      return Response.json(await member(user,'public.marriage_interview($1,$2,null)',[body.command,body.payload]));
    },
  });
  const tokenSubject = Buffer.from(JSON.stringify({sub:user.id})).toString('base64url');
  const headers = {authorization:'Bearer local.' + tokenSubject + '.fixture'};
  const context = {profileContext, sensitiveProfileAllowed:profile.signupConsents.sensitiveProfile};
  const start = await interview({action:'start',consentVersion:CONSENT_VERSION,...context},headers);
  const result = await interview({action:'directConfirm',revision:start.revision,choices,...context},headers);
  assert.equal(result.document.status,'confirmed');
  assert.deepEqual(result.document.confirmed.map(({id,values}) => ({id,values})), choices);
  return choices.length;
}

async function stagePhoto(db, user, member, service, {blur,revealPolicy} = {blur:0,revealPolicy:'never'}) {
  const photo = await member(user,'public.marriage_portrait_stage_prepare($1,$2,$3,true)',[blur,revealPolicy,user.gender]);
  // Storage's object row and the face service response are the two external boundaries.
  await db.query("select set_config('storage.operation','object.upload',false)");
  try {
    assert.equal(Boolean(photo.clearPath), blur > 0 && revealPolicy !== 'never');
    for (const path of [photo.path,photo.clearPath].filter(Boolean)) {
      await asMember(db,user.id,user.sessionId,() => db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('nisfayn-profile-portraits',$1,$2)",
        [path,{mimetype:'image/jpeg',size:51200}]));
    }
  } finally { await db.query("select set_config('storage.operation','',false)"); }
  await member(user,"public.marriage_portrait_stage_action($1,'uploaded')",[photo.id]);
  if (user.gender === 'man') {
    const check = await service("public.marriage_photo_face_begin($1,$2,'portrait','face-photo-v1')",[user.id,photo.id]);
    await service('public.marriage_photo_face_finish($1,$2,$3)',[check.attempt,user.id,'c'.repeat(64)]);
  }
  const resumed = await member(user,'public.marriage_portrait_stage_resume()');
  assert.equal(resumed.id,photo.id);
  assert.equal(resumed.status,user.gender === 'man' ? 'verified' : 'ready');
  assert.equal(resumed.portrait.blur,blur);
  assert.equal(resumed.portrait.revealPolicy,revealPolicy);
  return resumed;
}

// Accept the two actual GuidedApplication payloads. All roles, sessions and writes stay in this database.
export async function runRegistrationMatching(profiles, identities, portraits) {
  assert.deepEqual(profiles.map(profile => profile.gender).sort(),['man','woman']);
  const db = await createDatabase();
  const scalar = async (sql,args=[]) => (await db.query('select ' + sql + ' as result',args)).rows[0].result;
  const member = (user,sql,args=[]) => asMember(db,user.id,user.sessionId,() => scalar(sql,args));
  const service = (sql,args) => asService(db,() => scalar(sql,args));
  const account = async (label,identity) => {
    const user = {id:identity?.id ?? randomUUID(),sessionId:randomUUID(),email:identity?.email ?? label+'@example.invalid'};
    await addUser(db,user);
    return user;
  };
  try {
    const reviewer = await account('qa-reviewer');
    await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'reviewer','مراجع تجريبي')",[reviewer.id]);
    const review = (sql,args) => asMember(db,reviewer.id,reviewer.sessionId,async () => {
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:reviewer.id,session_id:reviewer.sessionId,role:'authenticated',aal:'aal2'})]);
      return scalar(sql,args);
    });
    assert.equal((await review('public.marriage_admin_access()')).authorized,true);
    const users = {}, result = {};
    for (const profile of profiles) {
      const gender = profile.gender;
      const identity = identities?.[gender];
      if (identities) {
        assert.ok(identity?.id && identity.email,'Missing browser signup identity for '+gender);
        assert.equal(profile.contact,identity.email);
      }
      const user = {...await account('qa-'+gender,identity),gender};
      users[gender] = user;
      const answers = await confirmAnswers(user,profile,member,service);
      if (portraits) assert.equal(Boolean(portraits[gender]),profile.signupConsents.photo);
      const photo = profile.signupConsents.photo ? await stagePhoto(db,user,member,service,portraits?.[gender]) : null;
      assert.ok(gender !== 'man' || photo, 'The submitted male profile must include the verified portrait consent');
      const submitted = await member(user,'public.marriage_apply($1)',[{...profile,consentVersion:profile.signupConsents.version}]);
      assert.equal(submitted.user.applicationStatus,'pending');
      assert.deepEqual(submitted.profile.surveyAnswers,profile.surveyAnswers);
      assert.deepEqual(submitted.profile.personalityAnswers,profile.personalityAnswers);
      if (photo) {
        const finalized = await member(user,"public.marriage_portrait_stage_action($1,'finalize')",[photo.id]);
        assert.equal(finalized.id,photo.id);
        assert.equal(finalized.blur,photo.portrait.blur);
        assert.equal(finalized.revealPolicy,photo.portrait.revealPolicy);
      }

      const application = await review('public.marriage_admin_member($1)',[user.id]);
      const approval = await review("public.marriage_admin_review($1,'approve',$2,$3,$4)",[user.id,application.revision,'اكتملت مراجعة الطلب التجريبي',randomUUID()]);
      assert.equal(approval.ok,true);
      const approved = await member(user,'public.marriage_state()');
      assert.equal(approved.user.applicationStatus,'approved');
      assert.equal(approved.membership.active,false);
      // Start at the trusted boundary after Apple's signed transaction has been verified.
      const productId = 'com.blindmatch.marriage.monthly.'+(gender === 'man' ? 'men' : 'women');
      const receipt = {bundleId:'com.blindmatch.marriage',productId,appAccountToken:approved.user.appAccountToken,
        originalTransactionId:randomUUID(),transactionId:randomUUID(),signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'};
      const paid = await service('public.marriage_record_receipt($1,$2,false)',[user.id,receipt]);
      assert.equal(paid.membership.active,true);
      const state = await member(user,'public.marriage_state()');
      assert.equal(state.user.applicationStatus,'approved');
      assert.equal(state.membership.active,true);
      result[gender] = {answers,photo:photo?.status ?? 'skipped',...(photo && {blur:photo.portrait.blur,revealPolicy:photo.portrait.revealPolicy}),approved:true,productId};
    }
    for (const [gender,other] of [['man','woman'],['woman','man']]) {
      const cards = await member(users[gender],'public.marriage_browse($1)',[{mode:'all',eligibleOnly:true}]);
      const card = cards.find(peer => peer.id === users[other].id);
      assert.ok(card,gender+' cannot find the other submitted member among eligible profiles');
      assert.equal(card.eligible,true);
      result[gender].foundPeer = true;
    }
    const request = await member(users.man,'public.marriage_request($1)',[users.woman.id]);
    assert.equal(await member(users.woman,"public.marriage_act($1,'accept')",[request]),true);
    await signCommunicationAgreement(member,users.woman,users.man,request);
    const message = 'رسالة تجريبية بعد قبول التعارف';
    await member(users.man,'public.marriage_message($1,$2,$3)',[request,message,randomUUID()]);
    assert.ok((await member(users.woman,'public.marriage_thread($1)',[request])).some(row => row.body === message));
    return {...result,mutualRequest:'accepted',messageDelivered:true};
  } finally { await db.close(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const profiles = JSON.parse(await readFile(process.argv[2],'utf8'));
  console.log(JSON.stringify(await runRegistrationMatching(profiles),null,2));
}
