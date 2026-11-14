import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, addUser, asMember } from './harness.mjs';
import { randomUUID, createHash } from 'node:crypto';

let db;
before(async()=>{db=await createDatabase();});
after(async()=>{await db?.close();});
const scalar=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;

test('smoking types and legacy answers remain valid throughout normalizer and interview capture',async()=>{
  for(const smoking of ['never','cigarettes','vape','shisha','sometimes','yes']) {
    const result=await scalar("marriage.normalize_marriage_extras($1,'{}','{}','personality-v1')",[{smoking}]);
    assert.equal(result.marriageBasics?.smoking??result.basics?.smoking,smoking);
    assert.equal(await scalar('marriage.interview_profile_values_valid($1)',[{fieldId:'marriageBasics.smoking',values:[smoking],mode:null,exclude:false}]),true,smoking);
  }
  await assert.rejects(scalar("marriage.normalize_marriage_extras($1,'{}','{}','personality-v1')",[{smoking:'unknown'}]),/خيار غير معروف/);
  assert.equal(await scalar('marriage.interview_profile_values_valid($1)',[{fieldId:'marriageBasics.smoking',values:['unknown'],mode:null,exclude:false}]),false);
});

test('draft resumes the explicit publication permission and rejects malformed choices',async()=>{
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
  await addUser(db,u);
  const call=(command,payload={})=>asMember(db,u.id,u.sessionId,()=>scalar('public.marriage_onboarding_draft($1,$2)',[command,payload]));
  const doc={version:1,owner:u.id,baseline:createHash('sha256').update('new').digest('hex'),step:'details',returnToReview:false,savedAt:1,answers:{displayName:'عضو تجريبي',marriageBasics:{smoking:'vape'}},permissions:{version:'2026-11-07-privacy',sensitiveProfile:true,sensitivePublication:true,assessment:true}};
  await call('save',doc);
  const loaded=await call('load');
  assert.equal(loaded.permissions.sensitivePublication,true);
  assert.equal(loaded.answers.marriageBasics.smoking,'vape');
  await assert.rejects(call('save',{...doc,permissions:{...doc.permissions,sensitivePublication:'yes'}}),/خصوصية/);
});
